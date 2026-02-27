module.exports = {
  apps: [
    {
      name: "auris",
      cwd: "/opt/auris",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: 3075,
      },
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
