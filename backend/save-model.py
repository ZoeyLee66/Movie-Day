from __future__ import annotations

import ast
import json
import math
import os
import pickle
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sentence_transformers import SentenceTransformer


# =========================================================
# CONFIG
# =========================================================
DATA_DIR = "E:\\data\\"
TMDB_MOVIES_PATH = "tmdb_5000_movies.csv"
TMDB_CREDITS_PATH = "tmdb_5000_credits.csv"
ML_MOVIES_PATH = "movies.csv"
ML_RATINGS_PATH = "ratings.csv"
ML_LINKS_PATH = "links.csv"
ML_TAGS_PATH = "tags.csv"

EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_BATCH_SIZE = 64
TOP_CAST_N = 5
USE_TAGS_TEXT = True

MIN_USER_RATINGS = 15
MIN_HISTORY_FOR_ROW = 3
HIGH_RATING_THRESHOLD = 4.0
LOW_RATING_THRESHOLD = 2.5

TEST_SIZE = 0.25
RANDOM_STATE = 42

RF_N_ESTIMATORS = 200
RF_MAX_DEPTH = 12
RF_MIN_SAMPLES_SPLIT = 4
RF_MIN_SAMPLES_LEAF = 3
RF_MAX_FEATURES = "sqrt"

MODEL_OUTPUT_PATH = "movie_recommender_bundle.pkl"


# =========================================================
# HELPERS
# =========================================================
def path_join(base: str, name: str) -> str:
    return os.path.join(base, name) if base else name


def safe_json_loads(value):
    if pd.isna(value):
        return []
    if isinstance(value, list):
        return value
    try:
        return json.loads(value)
    except Exception:
        try:
            return ast.literal_eval(value)
        except Exception:
            return []


def extract_name_list(json_text: str, key: str = "name", top_n: int | None = None) -> List[str]:
    items = safe_json_loads(json_text)
    if not isinstance(items, list):
        return []
    names = []
    for item in items:
        if isinstance(item, dict) and key in item:
            names.append(str(item[key]).strip())
    if top_n is not None:
        names = names[:top_n]
    return [x for x in names if x]


def extract_director(crew_json: str) -> str:
    crew = safe_json_loads(crew_json)
    if not isinstance(crew, list):
        return ""
    for person in crew:
        if isinstance(person, dict) and person.get("job") == "Director":
            return str(person.get("name", "")).strip()
    return ""


def rmse(y_true, y_pred) -> float:
    return float(np.sqrt(mean_squared_error(y_true, y_pred)))


def cosine_similarity_vector_to_matrix(vec: np.ndarray, mat: np.ndarray) -> np.ndarray:
    vec_norm = np.linalg.norm(vec)
    mat_norm = np.linalg.norm(mat, axis=1)
    return (mat @ vec) / np.clip(mat_norm * max(vec_norm, 1e-12), 1e-12, None)


# =========================================================
# DATA LOADING + MERGE
# =========================================================
def load_and_merge_data() -> Tuple[pd.DataFrame, pd.DataFrame]:
    tmdb_movies = pd.read_csv(path_join(DATA_DIR, TMDB_MOVIES_PATH))
    tmdb_credits = pd.read_csv(path_join(DATA_DIR, TMDB_CREDITS_PATH))
    ml_movies = pd.read_csv(path_join(DATA_DIR, ML_MOVIES_PATH))
    ml_ratings = pd.read_csv(path_join(DATA_DIR, ML_RATINGS_PATH))
    ml_links = pd.read_csv(path_join(DATA_DIR, ML_LINKS_PATH))

    tags_path = path_join(DATA_DIR, ML_TAGS_PATH)
    ml_tags = pd.read_csv(tags_path) if os.path.exists(tags_path) else pd.DataFrame(columns=["movieId", "tag"])

    ml_links = ml_links.dropna(subset=["tmdbId"]).copy()
    ml_links["tmdbId"] = pd.to_numeric(ml_links["tmdbId"], errors="coerce")
    ml_links = ml_links.dropna(subset=["tmdbId"]).copy()
    ml_links["tmdbId"] = ml_links["tmdbId"].astype(int)

    tmdb_movies["id"] = pd.to_numeric(tmdb_movies["id"], errors="coerce")
    tmdb_movies = tmdb_movies.dropna(subset=["id"]).copy()
    tmdb_movies["id"] = tmdb_movies["id"].astype(int)

    if "movie_id" in tmdb_credits.columns:
        tmdb_credits["movie_id"] = pd.to_numeric(tmdb_credits["movie_id"], errors="coerce")
        tmdb = tmdb_movies.merge(tmdb_credits, left_on="id", right_on="movie_id", how="left")
    else:
        tmdb = tmdb_movies.merge(tmdb_credits, on="title", how="left", suffixes=("", "_credits"))

    common = ml_links.merge(tmdb, left_on="tmdbId", right_on="id", how="inner")
    common = common.merge(ml_movies, on="movieId", how="left", suffixes=("_tmdb", "_ml"))

    if not ml_tags.empty:
        tags_agg = (
            ml_tags.dropna(subset=["tag"])
            .groupby("movieId")["tag"]
            .apply(lambda x: " | ".join(sorted(set(map(str, x)))))
            .reset_index(name="ml_tags_text")
        )
        common = common.merge(tags_agg, on="movieId", how="left")
    else:
        common["ml_tags_text"] = ""

    keep_cols = [
        "movieId", "tmdbId", "id",
        "title_tmdb", "title_ml", "title",
        "genres_tmdb", "genres_ml", "genres",
        "keywords", "overview",
        "cast", "crew",
        "ml_tags_text",
    ]
    keep_cols = [c for c in keep_cols if c in common.columns]
    common = common[keep_cols].copy()

    rename_map = {}
    if "id" in common.columns:
        rename_map["id"] = "tmdb_id"
    if "title_tmdb" in common.columns:
        rename_map["title_tmdb"] = "tmdb_title"
    elif "title" in common.columns:
        rename_map["title"] = "tmdb_title"
    if "title_ml" in common.columns:
        rename_map["title_ml"] = "ml_title"
    if "genres_tmdb" in common.columns:
        rename_map["genres_tmdb"] = "tmdb_genres"
    elif "genres" in common.columns:
        rename_map["genres"] = "tmdb_genres"
    if "genres_ml" in common.columns:
        rename_map["genres_ml"] = "ml_genres"

    common = common.rename(columns=rename_map)
    common = common.drop_duplicates(subset=["movieId"]).reset_index(drop=True)

    print(f"Number of common movies: {len(common)}")
    return common, ml_ratings


# =========================================================
# CONTENT TEXT + EMBEDDINGS
# =========================================================
def build_content_text(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    if "tmdb_genres" not in out.columns:
        raise KeyError("tmdb_genres column not found after merge.")

    out["genre_list"] = out["tmdb_genres"].apply(lambda x: extract_name_list(x, "name"))
    out["keyword_list"] = out["keywords"].apply(lambda x: extract_name_list(x, "name"))
    out["cast_list"] = out["cast"].apply(lambda x: extract_name_list(x, "name", TOP_CAST_N))
    out["director"] = out["crew"].apply(extract_director)

    def make_text(row):
        parts = []
        if row["genre_list"]:
            parts.append("Genres: " + ", ".join(row["genre_list"]))
        if row["keyword_list"]:
            parts.append("Keywords: " + ", ".join(row["keyword_list"]))
        if row["cast_list"]:
            parts.append("Cast: " + ", ".join(row["cast_list"]))
        if row["director"]:
            parts.append("Director: " + row["director"])
        if pd.notna(row["overview"]) and str(row["overview"]).strip():
            parts.append("Overview: " + str(row["overview"]).strip())
        if USE_TAGS_TEXT and pd.notna(row["ml_tags_text"]) and str(row["ml_tags_text"]).strip():
            parts.append("Tags: " + str(row["ml_tags_text"]).strip())
        return " | ".join(parts)

    out["content_text"] = out.apply(make_text, axis=1)
    return out


def build_embeddings(df: pd.DataFrame) -> pd.DataFrame:
    model = SentenceTransformer(EMBEDDING_MODEL_NAME)

    embeddings = model.encode(
        df["content_text"].fillna("").tolist(),
        batch_size=EMBEDDING_BATCH_SIZE,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )

    emb_cols = [f"emb_{i}" for i in range(embeddings.shape[1])]
    emb_df = pd.DataFrame(embeddings, columns=emb_cols)
    return pd.concat([df.reset_index(drop=True), emb_df], axis=1)


# =========================================================
# BUILD TRAINING EXAMPLES
# =========================================================
def build_user_examples(movie_df: pd.DataFrame, ratings_df: pd.DataFrame) -> pd.DataFrame:
    emb_cols = [c for c in movie_df.columns if c.startswith("emb_")]
    emb_matrix = movie_df[emb_cols].to_numpy(dtype=float)
    movieid_to_index = {mid: idx for idx, mid in enumerate(movie_df["movieId"].tolist())}

    ratings_df = ratings_df[ratings_df["movieId"].isin(movieid_to_index)].copy()

    eligible_users = (
        ratings_df.groupby("userId")["rating"]
        .count()
        .reset_index(name="n")
        .query("n >= @MIN_USER_RATINGS")["userId"]
        .tolist()
    )

    rows = []

    for user_id in eligible_users:
        user_ratings = ratings_df[ratings_df["userId"] == user_id].copy()
        user_ratings = user_ratings[user_ratings["movieId"].isin(movieid_to_index)].copy()

        if len(user_ratings) < MIN_USER_RATINGS:
            continue

        for _, target in user_ratings.iterrows():
            target_mid = int(target["movieId"])
            target_rating = float(target["rating"])
            target_idx = movieid_to_index[target_mid]
            target_emb = emb_matrix[target_idx]

            hist = user_ratings[user_ratings["movieId"] != target_mid].copy()
            if len(hist) < MIN_HISTORY_FOR_ROW:
                continue

            hist_indices = [movieid_to_index[mid] for mid in hist["movieId"].tolist()]
            hist_embs = emb_matrix[hist_indices]
            sims = cosine_similarity_vector_to_matrix(target_emb, hist_embs)

            hist = hist.reset_index(drop=True)
            hist["sim_to_target"] = sims

            liked = hist[hist["rating"] >= HIGH_RATING_THRESHOLD]
            disliked = hist[hist["rating"] <= LOW_RATING_THRESHOLD]

            user_profile_all = hist_embs.mean(axis=0)
            content_match_all = float(
                cosine_similarity_vector_to_matrix(target_emb, user_profile_all.reshape(1, -1))[0]
            )

            if len(liked) > 0:
                liked_indices = [movieid_to_index[mid] for mid in liked["movieId"].tolist()]
                liked_embs = emb_matrix[liked_indices]
                liked_sims = cosine_similarity_vector_to_matrix(target_emb, liked_embs)
                avg_sim_high_rated = float(np.mean(liked_sims))
                max_sim_high_rated = float(np.max(liked_sims))
                liked_genres = set(
                    g
                    for gs in movie_df.loc[movie_df["movieId"].isin(liked["movieId"]), "genre_list"]
                    for g in gs
                )
            else:
                avg_sim_high_rated = 0.0
                max_sim_high_rated = 0.0
                liked_genres = set()

            if len(disliked) > 0:
                disliked_indices = [movieid_to_index[mid] for mid in disliked["movieId"].tolist()]
                disliked_embs = emb_matrix[disliked_indices]
                disliked_sims = cosine_similarity_vector_to_matrix(target_emb, disliked_embs)
                avg_sim_low_rated = float(np.mean(disliked_sims))
                max_sim_low_rated = float(np.max(disliked_sims))
                disliked_genres = set(
                    g
                    for gs in movie_df.loc[movie_df["movieId"].isin(disliked["movieId"]), "genre_list"]
                    for g in gs
                )
            else:
                avg_sim_low_rated = 0.0
                max_sim_low_rated = 0.0
                disliked_genres = set()

            target_genres = set(movie_df.loc[movie_df["movieId"] == target_mid, "genre_list"].iloc[0])
            genre_overlap_ratio = (
                len(target_genres & liked_genres) / max(len(target_genres), 1)
                if liked_genres and target_genres else 0.0
            )
            low_genre_overlap_ratio = (
                len(target_genres & disliked_genres) / max(len(target_genres), 1)
                if disliked_genres and target_genres else 0.0
            )

            sim_high_minus_low = avg_sim_high_rated - avg_sim_low_rated
            max_sim_high_minus_low = max_sim_high_rated - max_sim_low_rated

            movie_row = movie_df.loc[movie_df["movieId"] == target_mid].iloc[0]
            title_value = (
                movie_row["ml_title"]
                if "ml_title" in movie_row.index and pd.notna(movie_row["ml_title"])
                else movie_row.get("tmdb_title", str(target_mid))
            )

            rows.append({
                "userId": user_id,
                "movieId": target_mid,
                "title": title_value,
                "target_rating": target_rating,
                "content_match_all": content_match_all,
                "avg_sim_high_rated": avg_sim_high_rated,
                "avg_sim_low_rated": avg_sim_low_rated,
                "max_sim_high_rated": max_sim_high_rated,
                "max_sim_low_rated": max_sim_low_rated,
                "sim_high_minus_low": sim_high_minus_low,
                "max_sim_high_minus_low": max_sim_high_minus_low,
                "genre_overlap_ratio": genre_overlap_ratio,
                "low_genre_overlap_ratio": low_genre_overlap_ratio,
                "log_user_rating_count": math.log1p(len(hist)),
            })

    return pd.DataFrame(rows)


# =========================================================
# FINAL FEATURE SET
# =========================================================
def get_final_feature_cols() -> List[str]:
    return [
        "content_match_all",
        "avg_sim_high_rated",
        "avg_sim_low_rated",
        "max_sim_high_rated",
        "max_sim_low_rated",
        "sim_high_minus_low",
        "max_sim_high_minus_low",
        "genre_overlap_ratio",
        "low_genre_overlap_ratio",
        "log_user_rating_count",
    ]


# =========================================================
# TRAIN MODEL
# =========================================================
def train_model(df_examples: pd.DataFrame, feature_cols: List[str]):
    train_df, test_df = train_test_split(
        df_examples,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
    )

    X_train = train_df[feature_cols]
    y_train = train_df["target_rating"]
    X_test = test_df[feature_cols]
    y_test = test_df["target_rating"]

    model = RandomForestRegressor(
        n_estimators=RF_N_ESTIMATORS,
        max_depth=RF_MAX_DEPTH,
        min_samples_split=RF_MIN_SAMPLES_SPLIT,
        min_samples_leaf=RF_MIN_SAMPLES_LEAF,
        max_features=RF_MAX_FEATURES,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    pred = model.predict(X_test)

    metrics = {
        "rmse": rmse(y_test, pred),
        "mae": float(mean_absolute_error(y_test, pred)),
        "r2": float(r2_score(y_test, pred)),
    }

    pred_df = test_df[["userId", "movieId", "title", "target_rating"]].copy()
    pred_df["predicted_rating"] = pred

    return model, metrics, pred_df


# =========================================================
# NEW USER PREDICTION (movieId + rating)
# =========================================================
def build_new_user_feature_rows(
    movie_df: pd.DataFrame,
    selected_movies_with_ratings: List[Dict],
) -> Tuple[pd.DataFrame, set]:
    emb_cols = [c for c in movie_df.columns if c.startswith("emb_")]
    emb_matrix = movie_df[emb_cols].to_numpy(dtype=float)
    movieid_to_index = {mid: idx for idx, mid in enumerate(movie_df["movieId"].tolist())}

    resolved = []
    for item in selected_movies_with_ratings:
        movie_id = int(item["movieId"])
        rating = float(item["rating"])

        if movie_id not in movieid_to_index:
            print(f"Warning: movieId not found -> {movie_id}")
            continue

        emb = emb_matrix[movieid_to_index[movie_id]]
        resolved.append((movie_id, rating, emb))

    if len(resolved) < MIN_HISTORY_FOR_ROW:
        raise ValueError(
            f"Need at least {MIN_HISTORY_FOR_ROW} resolved rated movies for new-user prediction."
        )

    watched_movie_ids = {m for m, _, _ in resolved}
    hist_embs = np.array([emb for _, _, emb in resolved], dtype=float)

    liked = [(m, r, e) for (m, r, e) in resolved if r >= HIGH_RATING_THRESHOLD]
    disliked = [(m, r, e) for (m, r, e) in resolved if r <= LOW_RATING_THRESHOLD]

    user_profile_all = hist_embs.mean(axis=0)

    liked_genres = set()
    if liked:
        liked_movie_ids = [m for m, _, _ in liked]
        liked_genres = set(
            g
            for gs in movie_df.loc[movie_df["movieId"].isin(liked_movie_ids), "genre_list"]
            for g in gs
        )

    disliked_genres = set()
    if disliked:
        disliked_movie_ids = [m for m, _, _ in disliked]
        disliked_genres = set(
            g
            for gs in movie_df.loc[movie_df["movieId"].isin(disliked_movie_ids), "genre_list"]
            for g in gs
        )

    rows = []

    for idx, movie_row in movie_df.iterrows():
        movie_id = int(movie_row["movieId"])
        if movie_id in watched_movie_ids:
            continue

        target_emb = emb_matrix[idx]

        content_match_all = float(
            cosine_similarity_vector_to_matrix(target_emb, user_profile_all.reshape(1, -1))[0]
        )

        if liked:
            liked_embs = np.array([e for _, _, e in liked], dtype=float)
            liked_sims = cosine_similarity_vector_to_matrix(target_emb, liked_embs)
            avg_sim_high_rated = float(np.mean(liked_sims))
            max_sim_high_rated = float(np.max(liked_sims))
        else:
            avg_sim_high_rated = 0.0
            max_sim_high_rated = 0.0

        if disliked:
            disliked_embs = np.array([e for _, _, e in disliked], dtype=float)
            disliked_sims = cosine_similarity_vector_to_matrix(target_emb, disliked_embs)
            avg_sim_low_rated = float(np.mean(disliked_sims))
            max_sim_low_rated = float(np.max(disliked_sims))
        else:
            avg_sim_low_rated = 0.0
            max_sim_low_rated = 0.0

        target_genres = set(movie_row["genre_list"])
        genre_overlap_ratio = (
            len(target_genres & liked_genres) / max(len(target_genres), 1)
            if liked_genres and target_genres else 0.0
        )
        low_genre_overlap_ratio = (
            len(target_genres & disliked_genres) / max(len(target_genres), 1)
            if disliked_genres and target_genres else 0.0
        )

        sim_high_minus_low = avg_sim_high_rated - avg_sim_low_rated
        max_sim_high_minus_low = max_sim_high_rated - max_sim_low_rated

        title_value = (
            movie_row["ml_title"]
            if "ml_title" in movie_df.columns and pd.notna(movie_row.get("ml_title"))
            else movie_row.get("tmdb_title", str(movie_id))
        )

        rows.append({
            "movieId": movie_id,
            "title": title_value,
            "content_match_all": content_match_all,
            "avg_sim_high_rated": avg_sim_high_rated,
            "avg_sim_low_rated": avg_sim_low_rated,
            "max_sim_high_rated": max_sim_high_rated,
            "max_sim_low_rated": max_sim_low_rated,
            "sim_high_minus_low": sim_high_minus_low,
            "max_sim_high_minus_low": max_sim_high_minus_low,
            "genre_overlap_ratio": genre_overlap_ratio,
            "low_genre_overlap_ratio": low_genre_overlap_ratio,
            "log_user_rating_count": math.log1p(len(resolved)),
            "overview": movie_row.get("overview", ""),
            "tmdb_id": int(movie_row["tmdb_id"]) if "tmdb_id" in movie_df.columns and pd.notna(movie_row["tmdb_id"]) else None,
        })

    return pd.DataFrame(rows), watched_movie_ids


def predict_for_new_user(
    model,
    movie_df: pd.DataFrame,
    selected_movies_with_ratings: List[Dict],
    feature_cols: List[str],
    top_n: int = 20,
) -> pd.DataFrame:
    candidate_df, _ = build_new_user_feature_rows(movie_df, selected_movies_with_ratings)
    X = candidate_df[feature_cols]
    candidate_df = candidate_df.copy()
    candidate_df["predicted_rating"] = model.predict(X)
    candidate_df["predicted_rating"] = candidate_df["predicted_rating"].clip(0.5, 5.0)
    candidate_df = candidate_df.sort_values("predicted_rating", ascending=False).reset_index(drop=True)
    return candidate_df.head(top_n)


# =========================================================
# SAVE / LOAD MODEL BUNDLE
# =========================================================
def save_model_bundle(
    path: str,
    model,
    movie_df: pd.DataFrame,
    feature_cols: List[str],
):
    bundle = {
        "model": model,
        "movie_df": movie_df,
        "feature_cols": feature_cols,
    }
    with open(path, "wb") as f:
        pickle.dump(bundle, f)


def load_model_bundle(path: str):
    with open(path, "rb") as f:
        return pickle.load(f)


# =========================================================
# MAIN
# =========================================================
def main():
    print("Loading and merging data...")
    movie_df, ratings_df = load_and_merge_data()

    print("Building content text...")
    movie_df = build_content_text(movie_df)

    print("Building embeddings...")
    movie_df = build_embeddings(movie_df)

    print("Filtering ratings to common movies...")
    ratings_df = ratings_df[ratings_df["movieId"].isin(movie_df["movieId"])].copy()

    print("Building training examples...")
    df_examples = build_user_examples(movie_df, ratings_df)
    print(f"Training data shape: {df_examples.shape}")

    feature_cols = get_final_feature_cols()

    print("Training RandomForestRegressor...")
    model, metrics, pred_df = train_model(df_examples, feature_cols)

    print("\n================ METRICS ================\n")
    print(f"RMSE: {metrics['rmse']:.4f}")
    print(f"MAE : {metrics['mae']:.4f}")
    print(f"R2  : {metrics['r2']:.4f}")

    print("\n================ TOP TEST PREDICTIONS ================\n")
    top_test = pred_df.sort_values("predicted_rating", ascending=False).head(20)
    for _, row in top_test.iterrows():
        print(f"{row['title']} | actual = {row['target_rating']:.2f} | predicted = {row['predicted_rating']:.2f}")

    print("\nSaving model bundle...")
    save_model_bundle(MODEL_OUTPUT_PATH, model, movie_df, feature_cols)
    print(f"Saved to: {MODEL_OUTPUT_PATH}")

    print("\n================ SAMPLE NEW USER RECOMMENDATIONS ================\n")
    new_user = [
        {"movieId": 32, "rating": 5.0},
        {"movieId": 296, "rating": 4.5},
        {"movieId": 597, "rating": 2.0},
    ]

    recs = predict_for_new_user(
        model=model,
        movie_df=movie_df,
        selected_movies_with_ratings=new_user,
        feature_cols=feature_cols,
        top_n=20,
    )

    for _, row in recs.iterrows():
        print(
            f"{row['movieId']} | {row['title']} | predicted_rating = {row['predicted_rating']:.2f} "
            f"| content_match_all = {row['content_match_all']:.4f} "
            f"| sim_high_minus_low = {row['sim_high_minus_low']:.4f}"
        )


if __name__ == "__main__":
    main()