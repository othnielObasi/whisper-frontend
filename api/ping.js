export default function handler(req, res) {
  res.status(200).json({ ok: true, at: new Date().toISOString() });
}
