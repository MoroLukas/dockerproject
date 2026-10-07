const pool = require("../config/database");

async function authenticate(request, reply) {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.code(401).send({
            error: "Authentication required"
        });
    }

    const token = authHeader.substring(7);

    const result = await pool.query(
        `
        SELECT
            users.id,
            users.username,
            users.email,
            users.plan
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token = $1
        `,
        [token]
    );

    if (result.rows.length === 0) {
        return reply.code(401).send({
            error: "Invalid session"
        });
    }

    request.user = result.rows[0];
}

module.exports = authenticate;