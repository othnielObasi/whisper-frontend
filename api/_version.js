export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    message: "version endpoint is live",
    time: new Date().toISOString(),
  });
}

export const config = { runtime: "nodejs" };
