// Cross-platform (Windows/Mac/Linux) Android web build. .env is not in git, so the live URL is set here.
const { execSync } = require("child_process");
const env = { ...process.env, REACT_APP_MOBILE: "1", REACT_APP_BACKEND_URL: "https://cinemaai.online" };
execSync("npx craco build", { stdio: "inherit", env });
