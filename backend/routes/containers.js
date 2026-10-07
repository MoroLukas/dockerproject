const pool = require("../config/database");
const authenticate = require("../middleware/auth");

const {
    createContainer,
    getContainer
} = require("../services/docker");

async function containerRoutes(fastify) {

    /*
     * Create container
     */
    fastify.post(
        "/containers",
        {
            preHandler: authenticate
        },
        async (request, reply) => {
            try {
                const { os } = request.body;
                const user = request.user;

                const countResult = await pool.query(
                    `
                    SELECT COUNT(*)::int AS count
                    FROM containers
                    WHERE user_id = $1
                    `,
                    [user.id]
                );

                const totalContainers =
                    countResult.rows[0].count;

                const maxContainers =
                    user.plan === "pro" ? 5 : 1;

                if (totalContainers >= maxContainers) {
                    return reply.code(403).send({
                        error: "Container limit reached",
                        limit: maxContainers
                    });
                }

                const runningResult = await pool.query(
                    `
                    SELECT COUNT(*)::int AS count
                    FROM containers
                    WHERE user_id = $1
                    AND status = 'running'
                    `,
                    [user.id]
                );

                const runningContainers =
                    runningResult.rows[0].count;

                const maxRunning =
                    user.plan === "pro" ? 3 : 1;

                if (runningContainers >= maxRunning) {
                    return reply.code(403).send({
                        error: "Running container limit reached",
                        limit: maxRunning
                    });
                }

                const { container, name } = await createContainer(os);

                const result = await pool.query(
                    `
                    INSERT INTO containers
                        (
                            user_id,
                            docker_container_id,
                            name,
                            os,
                            status
                        )
                    VALUES
                        ($1, $2, $3, $4, $5)
                    RETURNING
                        id,
                        name,
                        os,
                        status,
                        created_at
                    `,
                    [
                        user.id,
                        container.id,
                        name,
                        os,
                        "running"
                    ]
                );

                return reply.code(201).send({
                    message: "Container created",
                    container: result.rows[0]
                });

            } catch (err) {
                request.log.error(err);

                return reply.code(500).send({
                    error: err.message
                });
            }
        }
    );


    /*
     * List user's containers
     */
    fastify.get(
        "/containers",
        {
            preHandler: authenticate
        },
        async (request, reply) => {
            try {
                const result = await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        os,
                        status,
                        created_at
                    FROM containers
                    WHERE user_id = $1
                    ORDER BY created_at DESC
                    `,
                    [request.user.id]
                );

                return {
                    containers: result.rows
                };

            } catch (err) {
                request.log.error(err);

                return reply.code(500).send({
                    error: "Failed to get containers"
                });
            }
        }
    );


    /*
     * Execute command
     */
    fastify.post(
        "/containers/:id/exec",
        {
            preHandler: authenticate
        },
        async (request, reply) => {
            try {
                const { id } = request.params;
                const { command } = request.body;

                if (
                    !Array.isArray(command) ||
                    command.length === 0
                ) {
                    return reply.code(400).send({
                        error: "Command must be a non-empty array"
                    });
                }

                const result = await pool.query(
                    `
                    SELECT docker_container_id
                    FROM containers
                    WHERE id = $1
                    AND user_id = $2
                    `,
                    [id, request.user.id]
                );

                if (result.rows.length === 0) {
                    return reply.code(404).send({
                        error: "Container not found"
                    });
                }

                const dockerId =
                    result.rows[0].docker_container_id;

                const container =
                    getContainer(dockerId);

                const exec = await container.exec({
                    Cmd: command,
                    AttachStdout: true,
                    AttachStderr: true,
                    Tty: false
                });

                const stream = await exec.start({
                    hijack: true,
                    stdin: false
                });

                let output = "";

                stream.on("data", (chunk) => {
                    output += chunk.toString();
                });

                await new Promise((resolve, reject) => {
                    stream.on("end", resolve);
                    stream.on("error", reject);
                });

                return {
                    containerId: id,
                    command,
                    output
                };

            } catch (err) {
                request.log.error(err);

                return reply.code(500).send({
                    error: err.message
                });
            }
        }
    );

    fastify.delete(
        "/containers/:id",
        {
            preHandler: authenticate
        },
        async (request, reply) => {
            try {
                const { id } = request.params;

                const result = await pool.query(
                    `
                    SELECT docker_container_id
                    FROM containers
                    WHERE id = $1
                    AND user_id = $2
                    `,
                    [id, request.user.id]
                );

                if (result.rows.length === 0) {
                    return reply.code(404).send({
                        error: "Container not found"
                    });
                }

                const dockerId =
                    result.rows[0].docker_container_id;

                const container =
                    getContainer(dockerId);

                try {
                    await container.stop();
                } catch (err) {
                    if (!err.statusCode || err.statusCode !== 304) {
                        request.log.warn(err);
                    }
                }

                await container.remove();

                await pool.query(
                    `
                    DELETE FROM containers
                    WHERE id = $1
                    AND user_id = $2
                    `,
                    [id, request.user.id]
                );

                return {
                    message: "Container deleted"
                };

            } catch (err) {
                request.log.error(err);

                return reply.code(500).send({
                    error: "Failed to delete container"
                });
            }
        }
    );


    /*
     * WebSocket terminal
     */
    fastify.get(
        "/containers/:id/terminal",
        {
            websocket: true
        },
        async (socket, request) => {

            try {
                const { id } = request.params;

                /*
                 * WebSocket authentication
                 *
                 * Browser sends:
                 * ws://.../terminal?token=TOKEN
                 */
                const token =
                    request.query.token;

                if (!token) {
                    socket.close();
                    return;
                }

                const userResult = await pool.query(
                    `
                    SELECT user_id
                    FROM sessions
                    WHERE token = $1
                    `,
                    [token]
                );

                if (userResult.rows.length === 0) {
                    socket.close();
                    return;
                }

                const userId =
                    userResult.rows[0].user_id;

                /*
                 * Check ownership
                 */
                const containerResult =
                    await pool.query(
                        `
                        SELECT
                            docker_container_id
                        FROM containers
                        WHERE id = $1
                        AND user_id = $2
                        `,
                        [id, userId]
                    );

                if (containerResult.rows.length === 0) {
                    socket.close();
                    return;
                }

                const dockerId =
                    containerResult.rows[0]
                        .docker_container_id;

                request.log.info(
                    {
                        containerId: id,
                        userId
                    },
                    "WebSocket terminal connected"
                );

                const container =
                    getContainer(dockerId);

                const exec =
                    await container.exec({
                        Cmd: ["/bin/sh"],
                        AttachStdin: true,
                        AttachStdout: true,
                        AttachStderr: true,
                        Tty: true
                    });

                const stream =
                    await exec.start({
                        hijack: true,
                        stdin: true
                    });

                stream.on("data", (data) => {
                    if (socket.readyState === 1) {
                        socket.send(data);
                    }
                });

                stream.on("end", () => {
                    if (socket.readyState === 1) {
                        socket.close();
                    }
                });

                stream.on("error", (err) => {
                    request.log.error(err);

                    if (socket.readyState === 1) {
                        socket.close();
                    }
                });

                socket.on("message", (message) => {
                    stream.write(message);
                });

                socket.on("close", () => {
                    stream.end();
                });

                socket.on("error", (err) => {
                    request.log.error(err);
                    stream.end();
                });

            } catch (err) {
                request.log.error(err);

                if (socket.readyState === 1) {
                    socket.close();
                }
            }
        }
    );
}

module.exports = containerRoutes;