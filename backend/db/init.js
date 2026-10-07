const argon2 = require("argon2");
const pool = require("../config/database");

const initDatabase = async () => {

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            plan VARCHAR(10) NOT NULL DEFAULT 'free'
                CHECK (plan IN ('free', 'pro')),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS containers (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            docker_container_id VARCHAR(128) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            os VARCHAR(20) NOT NULL
                CHECK (os IN ('alpine', 'debian', 'ubuntu')),
            status VARCHAR(20) NOT NULL DEFAULT 'created',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    const freePassword = await argon2.hash("Password123!");
    const proPassword = await argon2.hash("ProPassword123!");

    await pool.query(`
        INSERT INTO users
            (username, email, password_hash, plan)
        VALUES
            ('lukas', 'lukas@test.local', $1, 'free'),
            ('pro', 'pro@test.local', $2, 'pro')
        ON CONFLICT (username) DO NOTHING;
    `, [freePassword, proPassword]);
};

module.exports = initDatabase;