from __future__ import annotations

import math
import pickle
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware


ROOT = Path(__file__).resolve().parent
BUNDLE_PATH = ROOT / "movie_recommender_bundle.pkl"


# =========================================================
# LOAD BUNDLE
# =========================================================
with open(BUNDLE_PATH, "rb") as f:
    bundle = pickle.load(f)

model = bundle["model"]
movie_df = bundle["movie_df"]
feature_cols = bundle["feature_cols"]
cfg = bundle["config"]


# =========================================================
# APP
# =========================================================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# REQUEST / RESPONSE SCHEMAS
# =========================================================
class RatingItem(BaseModel):
    movieId: int
    rating: float


class PredictRequest(BaseModel):
    ratings: List[RatingItem]


# =========================================================
# HELPERS
# =========================================================
def cosine_similarity_vector_to_matrix(vec: np.ndarray, mat: np.ndarray) -> np.ndarray:
    vec_norm = np.linalg.norm(vec)
    mat_norm = np.linalg.norm(mat, axis=1)
    return (mat @ vec) / np.clip(mat_norm * max(vec_norm, 1e-12), 1e-12, None)


def build_new_user_feature_rows_by_movieid(
    movie_df: pd.DataFrame,
    selected_movies_with_ratings: List[Dict],
    cfg,
) -> Tuple[pd.DataFrame, set]:
    emb_cols = [c for c in movie_df.columns if c.startswith("emb_")]
    emb_matrix = movie_df[emb_cols].to_numpy(dtype=float)
    movieid_to_index = {int(mid): idx for idx, mid in enumerate(movie_df["movieId"].tolist())}

    resolved = []

    for item in selected_movies_with_ratings:
        movie_id = int(item["movieId"])
        rating = float(item["rating"])

        if movie_id not in movieid_to_index:
            print(f"Warning: movieId not found -> {movie_id}")
            continue

        emb = emb_matrix[movieid_to_index[movie_id]]
        resolved.append((movie_id, rating, emb))

    if len(resolved) < cfg.min_history_for_row:
        raise ValueError(
            f"Need at least {cfg.min_history_for_row} resolved rated movies for new-user prediction."
        )

    watched_movie_ids = {m for m, _, _ in resolved}
    hist_embs = np.array([emb for _, _, emb in resolved], dtype=float)

    liked = [(m, r, e) for (m, r, e) in resolved if r >= cfg.high_rating_threshold]
    disliked = [(m, r, e) for (m, r, e) in resolved if r <= cfg.low_rating_threshold]

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


def predict_for_new_user_by_movieid(
    model,
    movie_df: pd.DataFrame,
    selected_movies_with_ratings: List[Dict],
    feature_cols: List[str],
    cfg,
) -> pd.DataFrame:
    candidate_df, _ = build_new_user_feature_rows_by_movieid(
        movie_df=movie_df,
        selected_movies_with_ratings=selected_movies_with_ratings,
        cfg=cfg,
    )

    X = candidate_df[feature_cols]
    candidate_df = candidate_df.copy()
    candidate_df["predicted_rating"] = model.predict(X)
    candidate_df["predicted_rating"] = candidate_df["predicted_rating"].clip(0.5, 5.0)

    return candidate_df.sort_values("predicted_rating", ascending=False).reset_index(drop=True)


# =========================================================
# ROUTES
# =========================================================
@app.get("/health")
def health():
    emb_cols = [c for c in movie_df.columns if c.startswith("emb_")]
    return {
        "ok": True,
        "movies": len(movie_df),
        "feature_cols": feature_cols,
        "embedding_dim": len(emb_cols),
    }


@app.post("/predict/all")
def predict_all(request: PredictRequest):
    ratings = [item.model_dump() for item in request.ratings]

    if len(ratings) < 5:
        return {
            "ok": False,
            "message": "At least 5 ratings are required.",
            "predictions": [],
        }

    pred_df = predict_for_new_user_by_movieid(
        model=model,
        movie_df=movie_df,
        selected_movies_with_ratings=ratings,
        feature_cols=feature_cols,
        cfg=cfg,
    )

    predictions = [
        {
            "movieId": int(row["movieId"]),
            "predicted_rating": round(float(row["predicted_rating"]), 2),
        }
        for _, row in pred_df.iterrows()
    ]

    return {
        "ok": True,
        "count": len(predictions),
        "predictions": predictions,
    }