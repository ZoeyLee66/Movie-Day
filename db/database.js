import * as SQLite from 'expo-sqlite';
import moviesSeed from '../data/movies_seed.json';

let db = null;

/**
 * DB 열기 + 테이블 만들기 + seed 데이터 넣기
 * 앱 시작할 때 가장 먼저 한 번 실행하면 됨
 */
export async function initDatabase() {
    if (db) return db;

    db = await SQLite.openDatabaseAsync('movies.db');

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
      movie_id INTEGER NOT NULL,
      user_rating REAL NOT NULL,
      FOREIGN KEY (movie_id) REFERENCES movies(movie_id)
    );
  `);

    await seedMoviesIfEmpty();

    return db;
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
    } else {
        await db.runAsync(
            `INSERT INTO user_ratings (movie_id, user_rating)
       VALUES (?, ?)`,
            [movieId, userRating]
        );
        console.log(`Inserted rating for movie_id=${movieId}`);
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
        `SELECT COUNT(*) as count FROM user_ratings`
    );

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