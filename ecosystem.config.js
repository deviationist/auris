module.exports = {
  apps: [
    {
      name: "auris",
      cwd: "/opt/auris",
      script: "server.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      env: {
        NODE_ENV: "production",
        PORT: process.env.AURIS_PORT || 3000,
      },
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
