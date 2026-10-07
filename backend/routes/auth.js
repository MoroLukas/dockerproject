const crypto = require("crypto");
const argon2 = require("argon2");

const pool = require("../config/database");
const authenticate = require("../middleware/auth");

async function authRoutes(fastify) {

    fastify.post("/register", async (request, reply) => {
        try {
            const { username, email, password } = request.body;

            if (!username || !email || !password) {
                return reply.code(400).send({
                    error: "Username, email and password are required"
                });
            }

            if (password.length < 8) {
                return reply.code(400).send({
                    error: "Password must be at least 8 characters"
                });
            }

            const passwordHash = await argon2.hash(password);

            const result = await pool.query(
                `
                INSERT INTO users
                    (username, email, password_hash)
                VALUES
                    ($1, $2, $3)
                RETURNING id, username, email, plan, created_at
                `,
                [username, email, passwordHash]
            );

            return reply.code(201).send({
                message: "User registered",
                user: result.rows[0]
            });

        } catch (err) {
            request.log.error(err);

            if (err.code === "23505") {
                return reply.code(409).send({
                    error: "Username or email already exists"
                });
            }

            return reply.code(500).send({
                error: "Registration failed"
            });
        }
    });


    fastify.post("/login", async (request, reply) => {
        try {
            const { username, password } = request.body;

            if (!username || !password) {
                return reply.code(400).send({
                    error: "Username and password are required"
                });
            }

            const result = await pool.query(
                `
                SELECT
                    id,
                    username,
                    email,
                    password_hash,
                    plan
                FROM users
                WHERE username = $1
                `,
                [username]
            );

            if (result.rows.length === 0) {
                return reply.code(401).send({
                    error: "Invalid username or password"
                });
            }

            const user = result.rows[0];

            const validPassword = await argon2.verify(
                user.password_hash,
                password
            );

            if (!validPassword) {
                return reply.code(401).send({
                    error: "Invalid username or password"
                });
            }

            const token = crypto
                .randomBytes(32)
                .toString("hex");

            await pool.query(
                `
                INSERT INTO sessions
                    (user_id, token)
                VALUES
                    ($1, $2)
                `,
                [user.id, token]
            );

            return {
                message: "Login successful",

                token,

                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    plan: user.plan
                }
            };

        } catch (err) {
            request.log.error(err);

            return reply.code(500).send({
                error: "Login failed"
            });
        }
    });


    fastify.get(
        "/me",
        {
            preHandler: authenticate
        },
        async (request) => {
            return {
                user: request.user
            };
        }
    );


    fastify.post(
        "/logout",
        {
            preHandler: authenticate
        },
        async (request, reply) => {
            try {
                const authHeader =
                    request.headers.authorization;

                const token = authHeader.substring(7);

                await pool.query(
                    `
                    DELETE FROM sessions
                    WHERE token = $1
                    `,
                    [token]
                );

                return {
                    message: "Logout successful"
                };

            } catch (err) {
                request.log.error(err);

                return reply.code(500).send({
                    error: "Logout failed"
                });
            }
        }
    );
}

module.exports = authRoutes;