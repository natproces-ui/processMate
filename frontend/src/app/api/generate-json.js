// pages/api/generate-json.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const response = await fetch('http://127.0.0.1:8000/generate-json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        if (response.ok) {
            res.status(200).json(data);
        } else {
            res.status(response.status).json(data);
        }
    } catch (err) {
        res.status(500).json({ detail: "Erreur serveur" });
    }
}