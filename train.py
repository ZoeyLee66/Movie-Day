import ast
import json
import math
import pickle

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sentence_transformers import SentenceTransformer


# =========================================================
# FILE PATHS
# =========================================================
PATH = "E:/data/"

TMDB_MOVIES_PATH = PATH + "tmdb_5000_movies.csv"
TMDB_CREDITS_PATH = PATH + "tmdb_5000_credits.csv"
ML_MOVIES_PATH = PATH + "movies.csv"
ML_RATINGS_PATH = PATH + "ratings.csv"
ML_LINKS_PATH = PATH + "links.csv"
ML_TAGS_PATH = PATH + "tags.csv"

MODEL_OUTPUT_PATH = "movie_recommender.pkl"


# =========================================================
# MODEL / FEATURE SETTINGS
# =========================================================
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"

# Number of texts to encode at once
EMBEDDING_BATCH_SIZE = 64

# Number of top cast members to keep
TOP_CAST_N = 5

# Whether to include MovieLens tags in content_text
USE_TAGS_TEXT = True

# Minimum number of ratings required for a user to be included in training
MIN_USER_RATINGS = 10

# Minimum number of history movies required to build a training row or new-user prediction
MIN_HISTORY_FOR_ROW = 5

# Threshold for high-rated movies
HIGH_RATING_THRESHOLD = 4.0

# Threshold for low-rated movies
LOW_RATING_THRESHOLD = 2.5

TEST_SIZE = 0.25
RANDOM_STATE = 42

RF_N_ESTIMATORS = 200
RF_MAX_DEPTH = 12
RF_MIN_SAMPLES_SPLIT = 4
RF_MIN_SAMPLES_LEAF = 3
RF_MAX_FEATURES = "sqrt"


# =========================================================
# HELPERS
# =========================================================
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


def extract_name_list(json_text, key="name", top_n=None):
    items = safe_json_loads(json_text)

    if not isinstance(items, list):
        return []

    names = []
    for item in items:
        if isinstance(item, dict) and key in item:
            names.append(str(item[key]).strip())

    if top_n is not None:
        names = names[:top_n]

    return [name for name in names if name]


def extract_director(crew_json):
    crew = safe_json_loads(crew_json)

    if not isinstance(crew, list):
        return ""

    for person in crew:
        if isinstance(person, dict) and person.get("job") == "Director":
            return str(person.get("name", "")).strip()

    return ""


def parse_ml_genres(value):
    if pd.isna(value):
        return []

    text = str(value).strip()
    if not text or text == "(no genres listed)":
        return []

    return [genre.strip() for genre in text.split("|") if genre.strip()]


def rmse(y_true, y_pred):
    return float(np.sqrt(mean_squared_error(y_true, y_pred)))


def cosine_similarity_vector_to_matrix(vec, mat):
    """
    1: the two vectors point in the same direction
    0: they are unrelated in direction
    -1:they point in completely opposite directions

    """
    vec_norm = np.linalg.norm(vec)
    mat_norm = np.linalg.norm(mat, axis=1)
    return (mat @ vec) / np.clip(mat_norm * max(vec_norm, 1e-12), 1e-12, None)  # calculates the cosine similarity by dividing the dot product by the lengths of the vectors, and it also prevents division by zero


# =========================================================
# LOAD + MERGE RAW DATA
# =========================================================
def load_and_merge_data():
    tmdb_movies = pd.read_csv(TMDB_MOVIES_PATH)
    tmdb_credits = pd.read_csv(TMDB_CREDITS_PATH)
    ml_movies = pd.read_csv(ML_MOVIES_PATH)
    ml_ratings = pd.read_csv(ML_RATINGS_PATH)
    ml_links = pd.read_csv(ML_LINKS_PATH)
    ml_tags = pd.read_csv(ML_TAGS_PATH)

    ml_links = ml_links.dropna(subset=["tmdbId"]).copy()
    ml_links["tmdbId"] = pd.to_numeric(ml_links["tmdbId"], errors="coerce")
    ml_links = ml_links.dropna(subset=["tmdbId"]).copy()
    ml_links["tmdbId"] = ml_links["tmdbId"].astype(int)

    tmdb_movies["id"] = pd.to_numeric(tmdb_movies["id"], errors="coerce")
    tmdb_movies = tmdb_movies.dropna(subset=["id"]).copy()
    tmdb_movies["id"] = tmdb_movies["id"].astype(int)

    if "movie_id" in tmdb_credits.columns:
        tmdb_credits["movie_id"] = pd.to_numeric(tmdb_credits["movie_id"], errors="coerce")
        tmdb = tmdb_movies.merge(
            tmdb_credits,
            left_on="id",
            right_on="movie_id",
            how="left"
        )
    else:
        tmdb = tmdb_movies.merge(
            tmdb_credits,
            on="title",
            how="left",
            suffixes=("", "_credits")
        )

    common = ml_links.merge(
        tmdb,
        left_on="tmdbId",
        right_on="id",
        how="inner"
    )
    common = common.merge(
        ml_movies,
        on="movieId",
        how="left",
        suffixes=("_tmdb", "_ml")
    )

    tags_agg = (
        ml_tags.dropna(subset=["tag"])
        .groupby("movieId")["tag"]
        .apply(lambda tags: ", ".join(sorted(set(map(str, tags)))))
        .reset_index(name="ml_tags_text")
    )
    common = common.merge(tags_agg, on="movieId", how="left")
    common["ml_tags_text"] = common["ml_tags_text"].fillna("")

    keep_cols = [
        "movieId",  # MovieLens movie id
        "tmdbId",
        "title_tmdb",
        "title_ml",
        "title",
        "genres_tmdb",
        "genres_ml",
        "genres",
        "keywords",
        "overview",
        "cast",
        "crew",
        "ml_tags_text",
    ]
    keep_cols = [col for col in keep_cols if col in common.columns]
    common = common[keep_cols].copy()

    title_ml = common["title_ml"] if "title_ml" in common.columns else pd.Series([None] * len(common))
    title_tmdb = common["title_tmdb"] if "title_tmdb" in common.columns else pd.Series([None] * len(common))
    title_base = common["title"] if "title" in common.columns else pd.Series([None] * len(common))

    common["title"] = title_ml.combine_first(title_tmdb).combine_first(title_base)

    if "genres_tmdb" in common.columns:
        common["tmdb_genres_raw"] = common["genres_tmdb"]
    elif "genres" in common.columns:
        common["tmdb_genres_raw"] = common["genres"]
    else:
        common["tmdb_genres_raw"] = None

    if "genres_ml" in common.columns:
        common["ml_genres_raw"] = common["genres_ml"]
    else:
        common["ml_genres_raw"] = None

    # Drop data to keep only movies that exist in both datasets
    common = common.drop_duplicates(subset=["movieId"]).reset_index(drop=True)

    return common, ml_ratings


# =========================================================
# BUILD CONTENT TEXT
# =========================================================
def build_content_text(df):
    """
    Combine movie information into a single text string
    """
    out = df.copy()
    out["tmdb_genre_list"] = out["tmdb_genres_raw"].apply(lambda x: extract_name_list(x, "name"))
    out["ml_genre_list"] = out["ml_genres_raw"].apply(parse_ml_genres)

    # Merge both genre sources into one combined genre lis
    out["genre_list"] = out.apply(
        lambda row: sorted(set(row["tmdb_genre_list"]) | set(row["ml_genre_list"])),
        axis=1
    )

    out["keyword_list"] = out["keywords"].apply(lambda x: extract_name_list(x, "name"))
    out["cast_list"] = out["cast"].apply(lambda x: extract_name_list(x, "name", TOP_CAST_N))
    out["director"] = out["crew"].apply(extract_director)

    def make_text(row):
        """
        Combine movie information into a single text string
        """
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

        return ". ".join(parts)

    out["content_text"] = out.apply(make_text, axis=1)
    return out


# =========================================================
# BUILD EMBEDDINGS
# =========================================================
def build_embeddings(df):
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
def build_user_examples(movie_df, ratings_df):
    emb_cols = [col for col in movie_df.columns if col.startswith("emb_")]

    # Embedding matrix for all movies
    emb_matrix = movie_df[emb_cols].to_numpy(dtype=float)

    # movieId -> movie_df index
    movieid_to_index = {
        movie_id: idx
        for idx, movie_id in enumerate(movie_df["movieId"].tolist())
    }

    # Keep only ratings for common movies
    ratings_df = ratings_df[ratings_df["movieId"].isin(movieid_to_index)].copy()

    # Select users eligible for training
    eligible_users = (
        ratings_df.groupby("userId")["rating"]
        .count()
        .reset_index(name="n")
        .query("n >= @MIN_USER_RATINGS")["userId"]
        .tolist()
    )

    rows = []

    for user_id in eligible_users:
        # All ratings from this user
        user_ratings = ratings_df[ratings_df["userId"] == user_id].copy()
        user_ratings = user_ratings[user_ratings["movieId"].isin(movieid_to_index)].copy()

        if len(user_ratings) < MIN_USER_RATINGS:
            continue

        # Use one rated movie as the target movie
        for _, target in user_ratings.iterrows():
            target_movie_id = int(target["movieId"])
            target_rating = float(target["rating"])

            target_index = movieid_to_index[target_movie_id]
            target_embedding = emb_matrix[target_index]

            # Use the remaining rated movies as the user's history
            history = user_ratings[user_ratings["movieId"] != target_movie_id].copy()

            if len(history) < MIN_HISTORY_FOR_ROW:
                continue

            history_indices = [movieid_to_index[mid] for mid in history["movieId"].tolist()]
            history_embeddings = emb_matrix[history_indices]

            # Calculate the similarity between the target movie and the movies in the user’s history
            sims = cosine_similarity_vector_to_matrix(target_embedding, history_embeddings)

            history = history.reset_index(drop=True)
            history["sim_to_target"] = sims

            # Split history into liked and disliked movies
            liked = history[history["rating"] >= HIGH_RATING_THRESHOLD]
            disliked = history[history["rating"] <= LOW_RATING_THRESHOLD]

            # User profile vector based on all history movies
            user_profile_all = history_embeddings.mean(axis=0)

            # Similarity between the target movie and the user's overall profile
            content_match_all = float(
                cosine_similarity_vector_to_matrix(
                    target_embedding,
                    user_profile_all.reshape(1, -1)
                )[0]
            )

            # Similarity feature with liked movies
            if len(liked) > 0:
                liked_indices = [movieid_to_index[mid] for mid in liked["movieId"].tolist()]  # converts liked movie IDs into row positions in the embedding matrix.
                liked_embeddings = emb_matrix[liked_indices]  # gets the embeddings of the liked movies from the embedding matrix
                liked_sims = cosine_similarity_vector_to_matrix(target_embedding, liked_embeddings)

                avg_sim_high_rated = float(np.mean(liked_sims))
                max_sim_high_rated = float(np.max(liked_sims))

                liked_genres = set(
                    genre
                    for genre_list in movie_df.loc[movie_df["movieId"].isin(liked["movieId"]), "genre_list"]
                    for genre in genre_list
                )
            else:
                avg_sim_high_rated = 0.0
                max_sim_high_rated = 0.0
                liked_genres = set()

            # Similarity feature with disliked movies
            if len(disliked) > 0:
                disliked_indices = [movieid_to_index[mid] for mid in disliked["movieId"].tolist()]
                disliked_embeddings = emb_matrix[disliked_indices]
                disliked_sims = cosine_similarity_vector_to_matrix(target_embedding, disliked_embeddings)

                avg_sim_low_rated = float(np.mean(disliked_sims))
                max_sim_low_rated = float(np.max(disliked_sims))

                disliked_genres = set(
                    genre
                    for genre_list in movie_df.loc[movie_df["movieId"].isin(disliked["movieId"]), "genre_list"]
                    for genre in genre_list
                )
            else:
                avg_sim_low_rated = 0.0
                max_sim_low_rated = 0.0
                disliked_genres = set()

            target_genres = set(
                movie_df.loc[movie_df["movieId"] == target_movie_id, "genre_list"].iloc[0]
            )

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

            movie_row = movie_df.loc[movie_df["movieId"] == target_movie_id].iloc[0]
            title_value = movie_row.get("title", str(target_movie_id))

            rows.append({
                "userId": user_id,
                "movieId": target_movie_id,
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
                "log_user_rating_count": math.log1p(len(history)),
            })

    return pd.DataFrame(rows)


# =========================================================0
# FINAL FEATURE COLUMNS
# =========================================================
def get_final_feature_cols():
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
# STEP 6: TRAIN MODEL
# =========================================================
def train_model(df_examples, feature_cols):
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
# NEW USER PREDICTION
# =========================================================
def build_new_user_feature_rows(movie_df, selected_movies_with_ratings):
    emb_cols = [col for col in movie_df.columns if col.startswith("emb_")]
    emb_matrix = movie_df[emb_cols].to_numpy(dtype=float)

    movieid_to_index = {
        movie_id: idx
        for idx, movie_id in enumerate(movie_df["movieId"].tolist())
    }

    resolved = []
    for item in selected_movies_with_ratings:
        movie_id = int(item["movieId"])
        rating = float(item["rating"])

        if movie_id not in movieid_to_index:
            print(f"Warning: movieId not found -> {movie_id}")
            continue

        embedding = emb_matrix[movieid_to_index[movie_id]]
        resolved.append((movie_id, rating, embedding))

    if len(resolved) < MIN_HISTORY_FOR_ROW:
        raise ValueError(
            f"Need at least {MIN_HISTORY_FOR_ROW} resolved rated movies for new-user prediction."
        )

    watched_movie_ids = {movie_id for movie_id, _, _ in resolved}
    history_embeddings = np.array([embedding for _, _, embedding in resolved], dtype=float)

    liked = [(m, r, e) for (m, r, e) in resolved if r >= HIGH_RATING_THRESHOLD]
    disliked = [(m, r, e) for (m, r, e) in resolved if r <= LOW_RATING_THRESHOLD]

    user_profile_all = history_embeddings.mean(axis=0)

    liked_genres = set()
    if liked:
        liked_movie_ids = [m for m, _, _ in liked]
        liked_genres = set(
            genre
            for genre_list in movie_df.loc[movie_df["movieId"].isin(liked_movie_ids), "genre_list"]
            for genre in genre_list
        )

    disliked_genres = set()
    if disliked:
        disliked_movie_ids = [m for m, _, _ in disliked]
        disliked_genres = set(
            genre
            for genre_list in movie_df.loc[movie_df["movieId"].isin(disliked_movie_ids), "genre_list"]
            for genre in genre_list
        )

    rows = []

    for idx, movie_row in movie_df.iterrows():
        movie_id = int(movie_row["movieId"])

        if movie_id in watched_movie_ids:
            continue

        target_embedding = emb_matrix[idx]

        content_match_all = float(
            cosine_similarity_vector_to_matrix(
                target_embedding,
                user_profile_all.reshape(1, -1)
            )[0]
        )

        if liked:
            liked_embeddings = np.array([e for _, _, e in liked], dtype=float)
            liked_sims = cosine_similarity_vector_to_matrix(target_embedding, liked_embeddings)
            avg_sim_high_rated = float(np.mean(liked_sims))
            max_sim_high_rated = float(np.max(liked_sims))
        else:
            avg_sim_high_rated = 0.0
            max_sim_high_rated = 0.0

        if disliked:
            disliked_embeddings = np.array([e for _, _, e in disliked], dtype=float)
            disliked_sims = cosine_similarity_vector_to_matrix(target_embedding, disliked_embeddings)
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

        rows.append({
            "movieId": movie_id,
            "title": movie_row.get("title", str(movie_id)),
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
        })

    return pd.DataFrame(rows), watched_movie_ids


def predict_for_new_user(model, movie_df, selected_movies_with_ratings, feature_cols, top_n=20):
    candidate_df, _ = build_new_user_feature_rows(movie_df, selected_movies_with_ratings)

    X = candidate_df[feature_cols]

    candidate_df = candidate_df.copy()
    candidate_df["predicted_rating"] = model.predict(X)
    candidate_df["predicted_rating"] = candidate_df["predicted_rating"].clip(0.5, 5.0)

    candidate_df = candidate_df.sort_values(
        "predicted_rating",
        ascending=False
    ).reset_index(drop=True)

    return candidate_df.head(top_n)


# =========================================================
# SAVE MODEL
# =========================================================
def save_model_bundle(path, model, movie_df, feature_cols):
    bundle = {
        "model": model,
        "movie_df": movie_df,
        "feature_cols": feature_cols,
    }

    with open(path, "wb") as f:
        pickle.dump(bundle, f)


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
        print(
            f"{row['title']} | actual = {row['target_rating']:.2f} | predicted = {row['predicted_rating']:.2f}"
        )

    print("\nSaving model...")
    save_model_bundle(MODEL_OUTPUT_PATH, model, movie_df, feature_cols)
    print(f"Saved to: {MODEL_OUTPUT_PATH}")

    print("\n================ SAMPLE NEW USER RECOMMENDATIONS ================\n")

    new_user = [
        {"movieId": 1, "rating": 4.5},     # Toy Story
        {"movieId": 3114, "rating": 4.5},  # Toy Story 2
        {"movieId": 2355, "rating": 4.0},  # A Bug's Life
        {"movieId": 4886, "rating": 4.0},  # Monsters, Inc.
        {"movieId": 6377, "rating": 4.0},  # Finding Nemo
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

    print("\n================ TOY STORY 3 PREDICTION ================\n")
    toy_story_3 = recs[recs["movieId"] == 78499]
    print(toy_story_3[["movieId", "title", "predicted_rating"]])


if __name__ == "__main__":
    main()