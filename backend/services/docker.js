const Docker = require("dockerode");

const docker = new Docker({
    socketPath: "/var/run/docker.sock"
});

const allowedImages = {
    alpine: "alpine:latest",
    debian: "debian:latest",
    ubuntu: "ubuntu:latest"
};

const createContainer = async (os) => {
    const image = allowedImages[os];

    if (!image) {
        throw new Error("Unsupported operating system");
    }

    const name = `lab-${Date.now()}`;

    const container = await docker.createContainer({
        Image: image,
        name,
        Cmd: ["sleep", "3600"],
        Tty: true
    });

    await container.start();

    return {
        container,
        name
    };
};

const getContainer = (id) => {
    return docker.getContainer(id);
};

module.exports = {
    docker,
    allowedImages,
    createContainer,
    getContainer
};