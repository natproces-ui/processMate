// pages/api/refs.js
import { refs } from '../../data/ref.json'; // ou fetch depuis FastAPI

export default function handler(req, res) {
    res.status(200).json({
        villes: refs.referentiels.villes,
        nationalitePaysNaissance: refs.referentiels.nationalitePaysNaissance
    });
}