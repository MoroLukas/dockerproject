const path = require("path");
const fs = require("fs");

const fastify = require("fastify")({
    logger: true
});

const websocket = require("@fastify/websocket");

const initDatabase = require("./db/init");

const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const containerRoutes = require("./routes/containers");

const start = async () => {
    try {
        await fastify.register(websocket);

        fastify.get("/", async (request, reply) => {
            const file = fs.readFileSync(
                path.join(__dirname, "public", "index.html")
            );

            return reply
                .type("text/html")
                .send(file);
        });

        await fastify.register(healthRoutes);
        await fastify.register(authRoutes);
        await fastify.register(containerRoutes);

        await initDatabase();

        fastify.log.info("Database tables ready");

        await fastify.listen({
            port: 3000,
            host: "0.0.0.0"
        });

    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();