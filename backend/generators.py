import random
from datetime import datetime, timedelta

# Données fixes
NOMS = [
    "Aarab", "ElKhalfi", "Mouline", "ElAmrani", "Tayeb", "Bakkali",
    "Ouahidi", "Fadili", "Bouziane", "Rami", "Chafik", "Moutawakil",
    "AitLhaj", "Naciri", "Harmouch", "Aarabia", "Essalhi", "Ghazi",
    "ElMokri", "Boutaleb", "Rharbaoui", "Cherif", "ElYazidi", "OuladAli"
]

PRENOMS = [
    "Omar", "Soukaina", "Reda", "Ghita", "Ilyas", "Manal",
    "Nour", "Amine", "Chaimae", "Tarik", "Ranya", "Samir",
    "Houda", "Ismail", "Lina", "Souad", "Adnane", "Ikram",
    "Nizar", "Safae", "Yahya", "Hind", "Walid", "Naima",
    "Malak", "Idriss", "Siham", "Bilal", "Ines", "Rim"
]

QUARTIERS = ["Hassan II", "Polo", "Derb Omar", "Ennakhil"]
NATIONALITES = ["AW", "AM", "CA", "BJ", "JO", "DM"]

# Formes juridiques pour les PM
FORMES_JURIDIQUES = ["SA", "SARL", "SNC", "SCS", "SCA"]

# Dénominations sociales pour les PM
DENOMINATIONS = [
    "IMPORT EXPORT SARL", "CONSULTING & CO", "TRADING SOLUTIONS",
    "SERVICES PLUS", "DISTRIBUTION NORD", "LOGISTICS EXPRESS",
    "TECH INNOVATIONS", "FINANCE GROUPE", "IMMOBILIER HOLDING"
]

def generate_idscv():
    return f"007{random.randint(10**26, 10**27 - 1):027d}"

def generate_rib():
    return f"007{random.randint(10**20, 10**21 - 1):021d}"

def generate_carte():
    return f"007{random.randint(10**12, 10**13 - 1):013d}"

def generate_cnie():
    lettres = ''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=random.randint(1, 2)))
    chiffres = ''.join(random.choices('0123456789', k=random.randint(1, 6)))
    return lettres + chiffres

def generate_nr():
    return ''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', k=14))

def generate_phone(is_mobile=True):
    formats = ["+2126-{0}", "06-{0}", "07-{0}"] if is_mobile else ["002125-{0}", "05-{0}"]
    num = random.randint(10000000, 99999999)
    return random.choice(formats).format(num)

def generate_email(nom, prenom):
    domain = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=random.randint(5, 12)))
    tld = random.choice(['com', 'org', 'net', 'ma'])
    return f"{nom}.{prenom}@{domain}.{tld}".lower()

def generate_date(start=1950, end=2005):
    start_date = datetime(start, 1, 1)
    end_date = datetime(end, 12, 31)
    delta = (end_date - start_date).days
    return (start_date + timedelta(days=random.randint(0, delta))).strftime("%d/%m/%Y")

def generate_contact(nom, prenom, villes):
    ville_data = random.choice(villes)
    return {
        "adresse1": f"{random.choice(['Rue', 'Quartier', 'Boulevard'])} {random.choice(QUARTIERS)}, {ville_data['ville']}",
        "adresse2": f"{random.choice(['Rue', 'Quartier', 'Boulevard'])} {random.choice(QUARTIERS)}, {ville_data['ville']}" if random.random() > 0.5 else None,
        "codePostal": None,
        "ville": ville_data['code'],
        "pays": "MA",
        "mobile": generate_phone(True),
        "fixe": generate_phone(False) if random.random() > 0.5 else None,
        "email": generate_email(nom, prenom)
    }

def empty_rep():
    return {
        "identifiantRepresentantLegal": {
            "idscv": None,
            "natureIdentifiantDeposantP": None,
            "numeroIdentifiantDeposantP": None,
            "nom": None,
            "prenom": None,
            "dateNaissance": None,
            "nationalite": None
        },
        "infosContact": {
            "adresse1": None,
            "adresse2": None,
            "codePostal": None,
            "ville": None,
            "pays": None,
            "mobile": None,
            "fixe": None,
            "email": None
        }
    }

def generate_representant_legal(villes):
    """Génère un représentant légal complet"""
    nom = random.choice(NOMS)
    prenom = random.choice(PRENOMS)
    return {
        "identifiantRepresentantLegal": {
            "idscv": generate_idscv(),
            "natureIdentifiantDeposantP": "CNIE",
            "numeroIdentifiantDeposantP": generate_cnie(),
            "nom": nom,
            "prenom": prenom,
            "dateNaissance": generate_date(1970, 1990),
            "nationalite": random.choice(["DM", "JO", "CA", "BJ"])
        },
        "infosContact": generate_contact(nom, prenom, villes)
    }

def calculate_parts(nombre):
    """
    Calcule les parts pour que la somme soit exactement 10000
    
    Args:
        nombre: Nombre d'héritiers ou cotitulaires
    
    Returns:
        Liste de parts qui somme à 10000
    """
    if nombre == 0:
        return []
    
    if nombre == 1:
        return [10000]
    
    # Distribution égale de base
    part_base = 10000 // nombre
    reste = 10000 % nombre
    
    # Créer la liste des parts
    parts = [part_base] * nombre
    
    # Distribuer le reste sur les premières parts
    for i in range(reste):
        parts[i] += 1
    
    # Vérifier que la somme = 10000
    assert sum(parts) == 10000, f"Erreur calcul parts: {sum(parts)} != 10000"
    
    return parts

def generate_deposant():
    """
    Génère un déposant avec variabilité selon les probabilités
    
    Variabilité:
    - typePersonne: 80% PP, 20% PM
    - isDecede: 70% O, 30% N
    - nombreHeritiers: Variable selon isDecede
    - version: 1 à 5
    """
    nom = random.choice(NOMS)
    prenom = random.choice(PRENOMS)
    
    # Choisir le type de personne (80% PP, 20% PM)
    type_personne = "PP" if random.random() < 0.8 else "PM"
    
    # Pour PP: nom/prenom, pas de forme juridique
    # Pour PM: denomination sociale, forme juridique
    if type_personne == "PP":
        nom_final = nom
        prenom_final = prenom
        forme_juridique = None
        denomination_sociale = None
    else:
        nom_final = random.choice(DENOMINATIONS)
        prenom_final = None
        forme_juridique = random.choice(FORMES_JURIDIQUES)
        denomination_sociale = nom_final
    
    # Choisir si décédé (70% O, 30% N)
    is_decede = "O" if random.random() < 0.7 else "N"
    
    # Nombre d'héritiers selon le statut
    if is_decede == "O":
        # Décédé: entre 1 et 8 héritiers
        nombre_heritiers = random.randint(1, 8)
    else:
        # Vivant: peut avoir des héritiers prévus (testament) ou pas
        # 50% ont un testament avec héritiers, 50% n'en ont pas
        nombre_heritiers = random.randint(1, 5) if random.random() < 0.5 else 0
    
    # Nombre de comptes: 1 à 3
    nombre_comptes = random.randint(1, 3)
    
    # Version: 1 à 5
    version = random.randint(1, 5)
    
    return {
        "idscv": generate_idscv(),
        "version": version,
        "typePersonne": type_personne,
        "nom": nom_final,
        "prenom": prenom_final,
        "dateNaissance": generate_date(1990, 2000) if type_personne == "PP" else None,
        "nationalite": random.choice(NATIONALITES),
        "formeJuridique": forme_juridique,
        "natureIdentifiantDeposant": "PASS" if type_personne == "PP" else "RC",
        "numeroIdentifiantDeposant": ''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', k=12)),
        "denominationSociale": denomination_sociale,
        "nombreComptes": nombre_comptes,
        "isDecede": is_decede,
        "nombreHeritiers": nombre_heritiers
    }

def generate_heritier(index, nombre_heritiers, villes):
    """
    Génère un héritier avec part calculée pour somme = 10000
    
    Args:
        index: Index de l'héritier (0 à nombre_heritiers-1)
        nombre_heritiers: Nombre total d'héritiers
        villes: Liste des villes disponibles
    """
    nom = random.choice(NOMS)
    prenom = random.choice(PRENOMS)
    
    # Varier les types d'identité
    if index % 3 == 0:
        nature = "CNIE"
        num_id = generate_cnie()
        idscv = generate_idscv()
    elif index % 3 == 1:
        nature = "NR"
        num_id = generate_nr()
        idscv = None
    else:
        nature = "PASS"
        num_id = ''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=10))
        idscv = generate_idscv() if random.random() > 0.5 else None
    
    # Calculer les parts (somme = 10000)
    parts = calculate_parts(nombre_heritiers)
    part_heritage = parts[index]
    
    # 30% des héritiers ont un représentant légal
    rep = empty_rep()
    if random.random() < 0.3:
        rep = generate_representant_legal(villes)
    
    return {
        "identifiantHeritier": {
            "idscv": idscv,
            "natureIdentifiantDeposantP": nature,
            "numeroIdentifiantDeposantP": num_id,
            "nom": nom,
            "prenom": prenom,
            "dateNaissance": generate_date(1970, 2000),
            "nationalite": random.choice(["AM", "CA", "BJ", "JO"]),
            "partHeritage": part_heritage
        },
        "infosContact": generate_contact(nom, prenom, villes),
        "representantLegal": rep
    }

def generate_compte(deposant_id, index_compte):
    """
    Génère un compte bancaire avec variabilité
    
    Variabilité:
    - natureCompte: 60% COL, 40% IND
    - nombreCotitulaires: 0 à 5 (si COL)
    - isCarteBancaire: 70% O, 30% N
    - Nombre de cartes: 1 à 4 (si O)
    """
    # Nature du compte (60% collectif, 40% individuel)
    nature_compte = "COL" if random.random() < 0.6 else "IND"
    
    # Cotitulaires
    if nature_compte == "COL":
        # Compte collectif: 2 à 6 personnes au total (titulaire + cotitulaires)
        nombre_cotitulaires_total = random.randint(2, 6)  # Total de personnes
        nombre_cotitulaires_liste = nombre_cotitulaires_total - 1  # Cotitulaires sans titulaire
        
        # ✅ CORRECTION: Calculer les parts UNIQUEMENT pour les cotitulaires
        # La liste cotitulaire[] contient seulement les cotitulaires (pas le titulaire)
        # Donc les parts doivent sommer à 10000
        parts = calculate_parts(nombre_cotitulaires_liste)
        
        # La liste cotitulaire contient UNIQUEMENT les cotitulaires (pas le titulaire)
        cotitulaires = []
        for i in range(nombre_cotitulaires_liste):
            cotitulaires.append({
                "idscv": generate_idscv(),
                "partCoTitulaire": parts[i]  # ✅ Utiliser parts[i] directement
            })
        
        # Note: Le titulaire n'est PAS dans cette liste
        # nombreCotitulaires = total des personnes (titulaire inclus)
        # Mais la somme des partCoTitulaire = 10000 (sans la part du titulaire)
        
    else:
        # Compte individuel: pas de cotitulaires
        nombre_cotitulaires_total = 1  # Seulement le titulaire
        cotitulaires = []
    
    # Cartes bancaires (70% oui, 30% non)
    is_carte_bancaire = "O" if random.random() < 0.7 else "N"
    
    if is_carte_bancaire == "O":
        # Entre 1 et 4 cartes
        nombre_cartes = random.randint(1, 4)
        cartes = [
            {
                "numeroCarte": generate_carte(),
                "validite": f"{random.choice(['04','10','05','03'])}/{random.choice(['2031','2034','2040'])}"
            }
            for _ in range(nombre_cartes)
        ]
    else:
        cartes = []
    
    # Nombre de prélèvements: 0 à 5
    nombre_prelevements = random.randint(0, 5)
    prelevements = []
    
    for i in range(nombre_prelevements):
        if random.random() < 0.3:
            prelevements.append({
                "montant": random.randint(1500000000, 2000000000),
                "nature": "AUTRE",
                "natureAutre": f"Prelevement NR {i}"
            })
        else:
            prelevements.append({
                "montant": random.randint(500000000, 800000000),
                "nature": random.choice(["PS", "LOYER", "CREDIT"]),
                "natureAutre": None
            })
    
    return {
        "infosCompteBancaire": {
            "rib": generate_rib(),
            "natureCompte": nature_compte,
            "nombreCotitulaires": nombre_cotitulaires_total if nature_compte == "COL" else None,
            "pcec": random.choice(["2038", "2041", "2050", "2100"]),
            "devise": random.choice(["MAD", "EUR", "USD", "RUB"]),
            "nomCompte": f"Compte {nature_compte} {index_compte + 1}",
            "isCarteBancaire": is_carte_bancaire,
            "statutCompte": random.choice(["STP", "NSTP", "CLOS"]),
            "compteNSTP": None,
            "autreCompteNSTP": None,
            "sensSolde": random.choice(["DEB", "CRED"]),
            "montantTotalSolde": random.randint(1000000000, 2000000000),
            "montantTotalDettes": random.randint(50000000, 100000000),
            "montantTotalDebits": random.randint(1000000000, 1500000000),
            "montantTotalAgios": random.randint(500000000, 1000000000),
            "montantTotalGarantie": random.randint(400000000, 600000000),
            "montantTotalInterets": random.randint(1000000000, 1200000000)
        },
        "prelevement": prelevements,
        "cotitulaire": cotitulaires,
        "infosCarteBancaire": cartes
    }

def generate_full_json(villes):
    """
    Génère un JSON SCV complet avec variabilité et cohérence
    
    Garanties:
    - nombreHeritiers = len(heritier)
    - Somme partHeritage = 10000
    - nombreCotitulaires = len(cotitulaire) + 1 (si COL)
    - Somme partCoTitulaire = 10000 (si COL)
    - isCarteBancaire = "O" → len(infosCarteBancaire) > 0
    - isCarteBancaire = "N" → len(infosCarteBancaire) = 0
    - nombreComptes = len(compte)
    """
    deposant = generate_deposant()
    
    # Générer le contact selon le type de personne
    if deposant["typePersonne"] == "PP":
        contact = generate_contact(deposant["nom"], deposant["prenom"], villes)
    else:
        # Pour PM, utiliser le nom de la société
        contact = generate_contact(deposant["nom"], "SARL", villes)
    
    # Générer les héritiers selon nombreHeritiers
    heritiers = []
    for i in range(deposant["nombreHeritiers"]):
        heritiers.append(generate_heritier(i, deposant["nombreHeritiers"], villes))
    
    # Générer le représentant légal (20% des déposants en ont un)
    if random.random() < 0.2:
        representants = [generate_representant_legal(villes)]
    else:
        representants = [empty_rep()]
    
    # Générer les comptes selon nombreComptes
    comptes = []
    for i in range(deposant["nombreComptes"]):
        comptes.append(generate_compte(deposant["idscv"], i))
    
    return {
        "SCV": {
            "identifiantDeposant": deposant,
            "infosContact": contact,
            "representantLegal": representants,
            "heritier": heritiers,
            "compte": comptes
        }
    }