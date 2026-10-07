const pool = require("../config/database");
const { docker } = require("../services/docker");

async function healthRoutes(fastify) {

    fastify.get("/health", async () => {
        return {
            status: "ok"
        };
    });

    fastify.get("/db", async (request, reply) => {
        try {
            const result = await pool.query(
                "SELECT NOW() AS time"
            );

            return {
                database: "connected",
                time: result.rows[0].time
            };
        } catch (err) {
            request.log.error(err);

            return reply.code(500).send({
                database: "disconnected",
                error: err.message
            });
        }
    });

    fastify.get("/docker", async (request, reply) => {
        try {
            const info = await docker.info();

            return {
                docker: "connected",
                containers: info.Containers,
                running: info.ContainersRunning,
                images: info.Images
            };
        } catch (err) {
            request.log.error(err);

            return reply.code(500).send({
                docker: "disconnected",
                error: err.message
            });
        }
    });
}

module.exports = healthRoutes;