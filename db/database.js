import * as SQLite from 'expo-sqlite';
import moviesSeed from '../data/movies_seed.json';

let db = null;
const BACKEND_URL = 'https://zoey-lee.com/movie-api';

/**
 * DB 열기 + 테이블 만들기 + seed 데이터 넣기
 * 앱 시작할 때 가장 먼저 한 번 실행하면 됨
 */
export async function initDatabase() {
    if (db) return db;

    db = await SQLite.openDatabaseAsync('movies.db');

    // await db.execAsync(`
    //     DROP TABLE IF EXISTS user_ratings;

    //     CREATE TABLE IF NOT EXISTS user_ratings (
    //         id INTEGER PRIMARY KEY AUTOINCREMENT,
    //         movie_id INTEGER NOT NULL UNIQUE,
    //         user_rating REAL NOT NULL,
    //         created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    //         FOREIGN KEY (movie_id) REFERENCES movies(movie_id)
    //     );
    // `);

    // SQLite 설정
    await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS movies (
      movie_id INTEGER PRIMARY KEY,
      tmdb_id INTEGER,
      title TEXT NOT NULL,
      release_year INTEGER,
      genres TEXT,
      overview TEXT,
      keywords TEXT,
      cast TEXT,
      director TEXT,
      avg_rating REAL,
      rating_count REAL,
      poster_url TEXT,
      ca_netflix INTEGER,
      ca_disney_plus INTEGER
    );

    CREATE TABLE IF NOT EXISTS user_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER NOT NULL UNIQUE,
      user_rating REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (movie_id) REFERENCES movies(movie_id)
    );

    CREATE TABLE IF NOT EXISTS user_movie_predictions (
        movie_id INTEGER PRIMARY KEY,
        predicted_rating REAL NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (movie_id) REFERENCES movies(movie_id)
    );
  `);

    await ensureUserRatingsCreatedAt();
    await seedMoviesIfEmpty();

    return db;
}

async function ensureUserRatingsCreatedAt() {
    const columns = await db.getAllAsync(`PRAGMA table_info(user_ratings)`);
    const columnNames = columns.map((column) => column.name);

    if (!columnNames.includes('created_at')) {
        await db.execAsync(`ALTER TABLE user_ratings ADD COLUMN created_at TEXT;`);
        await db.execAsync(`
            UPDATE user_ratings
            SET created_at = CURRENT_TIMESTAMP
            WHERE created_at IS NULL
        `);
    }
}

/**
 * movies 테이블이 비어 있으면 JSON seed 데이터를 한 번만 넣음
 */
async function seedMoviesIfEmpty() {
    const result = await db.getFirstAsync(`SELECT COUNT(*) as count FROM movies`);
    const count = result?.count ?? 0;

    if (count > 0) {
        console.log('Movies already seeded');
        return;
    }

    console.log('Seeding movies...');

    for (const movie of moviesSeed) {
        await db.runAsync(
            `INSERT INTO movies (
        movie_id,
        tmdb_id,
        title,
        release_year,
        genres,
        overview,
        keywords,
        cast,
        director,
        avg_rating,
        rating_count,
        poster_url,
        ca_netflix,
        ca_disney_plus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                movie.movie_id,
                movie.tmdb_id,
                movie.title,
                movie.release_year,
                movie.genres,
                movie.overview,
                movie.keywords,
                movie.cast,
                movie.director,
                movie.avg_rating,
                movie.rating_count,
                movie.poster_url,
                movie.ca_netflix,
                movie.ca_disney_plus
            ]
        );
    }

    console.log('Movies seeded successfully');
}

export async function resetUserRatings() {
    try {
        await db.runAsync(`DELETE FROM user_ratings`);
        console.log('user_ratings table reset complete');
    } catch (error) {
        console.error('Failed to reset user_ratings:', error);
        throw error;
    }
}

export async function getAllMovies() {
    return await db.getAllAsync(`
    SELECT *
    FROM movies
  `);
}

export async function getUserRatingsForPrediction() {
    return await db.getAllAsync(`
        SELECT
            movie_id as movieId,
            user_rating as rating
        FROM user_ratings
        ORDER BY created_at DESC
    `);
}

export async function savePredictedRatings(predictions) {
    if (!predictions || predictions.length === 0) return;

    await db.withTransactionAsync(async () => {
        for (const item of predictions) {
            await db.runAsync(
                `
                INSERT INTO user_movie_predictions (movie_id, predicted_rating, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(movie_id) DO UPDATE SET
                    predicted_rating = excluded.predicted_rating,
                    updated_at = CURRENT_TIMESTAMP
                `,
                [item.movieId, item.predicted_rating]
            );
        }
    });
}

export async function rebuildPredictionsFromBackend() {
    const ratings = await getUserRatingsForPrediction();

    if (ratings.length < 5) {
        return { ok: false, message: 'Need at least 5 ratings.' };
    }

    const response = await fetch(`${BACKEND_URL}/predict/all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratings }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Prediction API failed: ${text}`);
    }

    const data = await response.json();

    if (data.ok) {
        await savePredictedRatings(data.predictions);
    }

    return data;
}

export async function saveUserRatingAndRefreshPredictions(movieId, userRating) {
    await saveUserRating(movieId, userRating);

    const count = await getUserRatingsCount();
    if (count >= 5) {
        await rebuildPredictionsFromBackend();
    }
}

export async function getHomeMovies() {
    return await db.getAllAsync(`
        SELECT
            m.movie_id,
            m.tmdb_id,
            m.title,
            m.release_year,
            m.genres,
            m.overview,
            m.keywords,
            m.cast,
            m.director,
            m.avg_rating,
            m.rating_count,
            m.poster_url,
            m.ca_netflix,
            m.ca_disney_plus,
            ur.user_rating,
            ump.predicted_rating
        FROM movies m
        LEFT JOIN user_ratings ur
            ON m.movie_id = ur.movie_id
        LEFT JOIN user_movie_predictions ump
            ON m.movie_id = ump.movie_id
    `);
}

/**
 * 첫 사용자 여부 확인
 * user_ratings에 아무 데이터도 없으면 true
 */
export async function isFirstTimeUser() {
    const result = await db.getFirstAsync(
        `SELECT COUNT(*) as count FROM user_ratings`
    );

    return (result?.count ?? 0) === 0;
}

/**
 * 특정 영화 1개 가져오기
 */
export async function getMovieById(movieId) {
    return await db.getFirstAsync(
        `SELECT * FROM movies WHERE movie_id = ?`,
        [movieId]
    );
}

/**
 * 유저 평점 저장
 * 이미 평가한 영화면 update, 아니면 insert
 */
export async function saveUserRating(movieId, userRating) {
    const existing = await db.getFirstAsync(
        `SELECT id FROM user_ratings WHERE movie_id = ?`,
        [movieId]
    );

    if (existing) {
        await db.runAsync(
            `UPDATE user_ratings
            SET user_rating = ?, created_at = CURRENT_TIMESTAMP
            WHERE movie_id = ?`,
            [userRating, movieId]
        );
        console.log(`Updated rating for movie_id=${movieId}`);
        console.log(`Updated user rate: ${userRating}`);
    } else {
        await db.runAsync(
            `INSERT INTO user_ratings (movie_id, user_rating)
            VALUES (?, ?)`,
            [movieId, userRating]
        );
        console.log(`Inserted rating for movie_id=${movieId}`);
        console.log(`Inserted user rate: ${userRating}`);
    }
}

export async function getUserRating(movieId) {
    try {
        const result = await db.getFirstAsync(
            `
            SELECT user_rating
            FROM user_ratings
            WHERE movie_id = ?
            `,
            [movieId]
        );

        return result ? result.user_rating : null;
    } catch (error) {
        console.error('Failed to get user rating:', error);
        throw error;
    }
}

/**
 * 유저가 평가한 영화들 가져오기
 */
export async function getUserRatings() {
    return await db.getAllAsync(`
    SELECT
      ur.id,
      ur.movie_id,
      ur.user_rating,
      ur.created_at,
      m.title,
      m.poster_url,
      m.genres
    FROM user_ratings ur
    JOIN movies m ON ur.movie_id = m.movie_id
    ORDER BY ur.created_at DESC
  `);
}

/**
 * 유저가 아직 평가하지 않은 영화들 가져오기
 * 나중에 예측 계산할 때 유용
 */
export async function getUnratedMovies() {
    return await db.getAllAsync(
        `
    SELECT *
    FROM movies
    WHERE movie_id NOT IN (
      SELECT movie_id FROM user_ratings
    )
    ORDER BY RANDOM()
    `
    );
}

/**
 * user_ratings 개수 가져오기
 * 최소 5개 평가했는지 같은 조건 체크할 때 사용
 */
export async function getUserRatingsCount() {
    const result = await db.getFirstAsync(
        `SELECT COUNT(DISTINCT movie_id) as count FROM user_ratings`
    );
    console.log(`user rate count: ${result.count}`)
    return result?.count ?? 0;
}

/**
 * 디버깅용: movies 테이블 row 수 확인
 */
export async function getMoviesCount() {
    const result = await db.getFirstAsync(
        `SELECT COUNT(*) as count FROM movies`
    );

    return result?.count ?? 0;
}

/**
 * 디버깅용: user_ratings 테이블 row 수 확인
 */
export async function getUserRatingsTableCount() {
    const result = await db.getFirstAsync(
        `SELECT COUNT(*) as count FROM user_ratings`
    );

    return result?.count ?? 0;
}