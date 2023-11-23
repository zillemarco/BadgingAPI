const { Octokit } = require("@octokit/rest");

const { saveUser } = require("../../database/controllers/user.controller.js");
const github_helper = require("../helpers/github.js");

const handleOAuthCallback = async (req, res) => {
  const code = req.body.code ?? req.query.code;

  const { access_token, errors: access_token_errors } =
    await github_helper.requestAccessToken(code);
  if (access_token_errors.length > 0) {
    res.status(500).send(access_token_errors.join());
    return;
  }

  const octokit = new Octokit({ auth: `${access_token}` });

  // Authenticated user details
  const { user_info, errors: user_info_errors } =
    await github_helper.getUserInfo(octokit);
  if (user_info_errors.length > 0) {
    res.status(500).send(user_info_errors.join());
    return;
  }

  // Save user to database
  const savedUser = await saveUser(
    user_info.login,
    user_info.name,
    user_info.email,
    user_info.id,
    null
  );
  if (!savedUser) {
    res.status(500).send("Error saving user info");
    return;
  }

  // Public repos they maintain, administer, or own
  const { repositories, errors: repositories_errors } =
    await github_helper.getUserRepositories(octokit);
  if (repositories_errors.length > 0) {
    res.status(500).send(repositories_errors.join());
    return;
  }

  if (
    process.env.NODE_ENV === "production" ||
    process.env.RETURN_JSON_ON_LOGIN
  ) {
    res.status(200).json({
      userId: savedUser.id,
      name: savedUser.name,
      username: savedUser.login,
      email: savedUser.email,
      repos: repositories,
      provider: "github",
    });
  } else if (process.env.NODE_ENV === "development") {
    res.status(200).send(`
        <html>
        <head>
          <title>Repo List</title>
        </head>
        <body>
          <h1>Welcome ${savedUser.name}</h1>
          <h2>Username: ${savedUser.login}</h2>
          <h2>Email: ${savedUser.email}</h2>
          <form action="/api/repos-to-badge" method="post">
            <input type="hidden" name="provider" value="github">
            <input type="hidden" name="userId" value="${savedUser.id}">
            <h2>Select Repositories:</h2>
            ${repositories
              .map(
                (repo) => `
                <div>
                  <input type="checkbox" name="repos[]" value="${repo.id}">
                  <label for="${repo.id}">${repo.fullName}</label>
                </div>
              `
              )
              .join("")}
            <br>
            <input type="submit" value="Submit">
          </form>
        </body>
      </html>
    `);
  } else {
    res.status(500).send("Unknown process mode");
  }
};

/**
 * Sets up the provided Express app routes for GitHub
 * @param {*} app Express application instance
 */
const setupGitHubRoutes = (app) => {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.RETURN_JSON_ON_LOGIN
  ) {
    app.post("/api/callback/github", handleOAuthCallback);
  } else if (process.env.NODE_ENV === "development") {
    app.get("/api/callback/github", handleOAuthCallback);
  }
};

module.exports = {
  setupGitHubRoutes,
};