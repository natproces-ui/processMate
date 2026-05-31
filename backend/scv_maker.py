#!/usr/bin/env python3
"""
SCVMaker - Générateur de datasets SCV pour tests
Génère 4 types de SCVs: héritiers, cotitulaires, PM, comptes normaux
"""

import json
import random
from datetime import datetime, timedelta
from generators import (
    NOMS, PRENOMS, QUARTIERS, NATIONALITES, FORMES_JURIDIQUES, DENOMINATIONS,
    generate_idscv, generate_rib, generate_carte, generate_cnie, generate_nr,
    generate_phone, generate_email, generate_date, generate_contact,
    calculate_parts, empty_rep, generate_representant_legal
)

# Données de test pour les villes
VILLES_TEST = [
    {"ville": "Casablanca", "code": "20000"},
    {"ville": "Fès", "code": "30000"},
    {"ville": "Marrakech", "code": "40000"},
    {"ville": "Agadir", "code": "80000"},
]


class SCVMaker:
    """Générateur de SCVs pour différents cas de test"""
    
    @staticmethod
    def generate_account_with_heirs(count=5):
        """
        Génère des comptes avec héritiers (compte décédé)
        
        Caractéristiques:
        - isDecede = 'O' (obligatoire)
        - nombreHeritiers >= 1
        - heritier[] rempli avec des héritiers
        - Peut avoir représentant légal
        """
        results = []
        
        for i in range(count):
            nom = random.choice(NOMS)
            prenom = random.choice(PRENOMS)
            
            # Délégué décédé obligatoirement
            nombre_heritiers = random.randint(2, 5)
            
            # Générer héritiers
            heritiers = []
            parts = calculate_parts(nombre_heritiers)
            
            for heir_idx in range(nombre_heritiers):
                heir_nom = random.choice(NOMS)
                heir_prenom = random.choice(PRENOMS)
                
                heritiers.append({
                    "identifiantHeritier": {
                        "idscv": generate_idscv(),
                        "natureIdentifiantDeposantP": random.choice(["CNIE", "NR", "PASS"]),
                        "numeroIdentifiantDeposantP": generate_cnie() if random.random() > 0.5 else generate_nr(),
                        "nom": heir_nom,
                        "prenom": heir_prenom,
                        "dateNaissance": generate_date(1970, 1995),
                        "nationalite": random.choice(NATIONALITES),
                        "partHeritage": parts[heir_idx]
                    },
                    "infosContact": generate_contact(heir_nom, heir_prenom, VILLES_TEST),
                    "representantLegal": empty_rep()
                })
            
            # Compte avec héritiers (généralement 1 seul compte pour décédé)
            compte = {
                "infosCompteBancaire": {
                    "rib": generate_rib(),
                    "natureCompte": "IND",
                    "nombreCotitulaires": None,
                    "pcec": random.choice(["2038", "2041", "2050"]),
                    "devise": random.choice(["MAD", "EUR"]),
                    "nomCompte": f"Compte de succession {i+1}",
                    "isCarteBancaire": random.choice(["O", "N"]),
                    "statutCompte": "STP",
                    "compteNSTP": None,
                    "autreCompteNSTP": None,
                    "sensSolde": random.choice(["DEB", "CRED"]),
                    "montantTotalSolde": random.randint(500000000, 3000000000),
                    "montantTotalDettes": random.randint(10000000, 200000000),
                    "montantTotalDebits": random.randint(500000000, 2000000000),
                    "montantTotalAgios": random.randint(100000000, 500000000),
                    "montantTotalGarantie": None,
                    "montantTotalInterets": random.randint(10000000, 300000000)
                },
                "prelevement": [],
                "cotitulaire": [],
                "infosCarteBancaire": []
            }
            
            scv = {
                "SCV": {
                    "identifiantDeposant": {
                        "idscv": generate_idscv(),
                        "version": 1,
                        "typePersonne": "PP",
                        "nom": nom,
                        "prenom": prenom,
                        "dateNaissance": generate_date(1940, 1960),
                        "nationalite": random.choice(NATIONALITES),
                        "formeJuridique": None,
                        "natureIdentifiantDeposant": "CNIE",
                        "numeroIdentifiantDeposant": generate_cnie(),
                        "denominationSociale": None,
                        "nombreComptes": 1,
                        "isDecede": "O",  # ✅ OBLIGATOIRE pour héritiers
                        "nombreHeritiers": nombre_heritiers
                    },
                    "infosContact": generate_contact(nom, prenom, VILLES_TEST),
                    "representantLegal": [generate_representant_legal(VILLES_TEST) if random.random() < 0.4 else empty_rep()],
                    "heritier": heritiers,
                    "compte": [compte]
                }
            }
            
            results.append(scv)
        
        return results
    
    
    @staticmethod
    def generate_account_with_cotitulaires(count=5):
        """
        Génère des comptes avec cotitulaires (compte collectif)
        
        Caractéristiques:
        - natureCompte = 'COL'
        - nombreCotitulaires >= 2
        - cotitulaire[] rempli avec des cotitulaires
        - Somme des partCoTitulaire = 10000
        """
        results = []
        
        for i in range(count):
            # Nombre de cotitulaires (total = titulaire + cotitulaires)
            nombre_total = random.randint(2, 4)
            nombre_cotit_liste = nombre_total - 1  # Sans le titulaire
            
            # Parts du compte collectif
            parts = calculate_parts(nombre_cotit_liste)
            
            # Cotitulaires
            cotitulaires = []
            for j in range(nombre_cotit_liste):
                cotitulaires.append({
                    "idscv": generate_idscv(),
                    "partCoTitulaire": parts[j]
                })
            
            # Titulaire
            titulaire_nom = random.choice(NOMS)
            titulaire_prenom = random.choice(PRENOMS)
            
            # Compte collectif
            compte = {
                "infosCompteBancaire": {
                    "rib": generate_rib(),
                    "natureCompte": "COL",
                    "nombreCotitulaires": nombre_total,
                    "pcec": random.choice(["2038", "2041", "2050"]),
                    "devise": "MAD",
                    "nomCompte": f"Compte collectif {i+1}",
                    "isCarteBancaire": random.choice(["O", "N"]),
                    "statutCompte": "STP",
                    "compteNSTP": None,
                    "autreCompteNSTP": None,
                    "sensSolde": random.choice(["DEB", "CRED"]),
                    "montantTotalSolde": random.randint(1000000000, 5000000000),
                    "montantTotalDettes": random.randint(100000000, 500000000),
                    "montantTotalDebits": random.randint(1000000000, 3000000000),
                    "montantTotalAgios": random.randint(100000000, 300000000),
                    "montantTotalGarantie": None,
                    "montantTotalInterets": random.randint(50000000, 300000000)
                },
                "prelevement": [
                    {
                        "montant": random.randint(500000000, 1000000000),
                        "nature": random.choice(["LOYER", "PS", "CREDIT"]),
                        "natureAutre": None
                    }
                    for _ in range(random.randint(1, 3))
                ],
                "cotitulaire": cotitulaires,
                "infosCarteBancaire": []
            }
            
            scv = {
                "SCV": {
                    "identifiantDeposant": {
                        "idscv": generate_idscv(),
                        "version": 1,
                        "typePersonne": "PP",
                        "nom": titulaire_nom,
                        "prenom": titulaire_prenom,
                        "dateNaissance": generate_date(1960, 1980),
                        "nationalite": random.choice(NATIONALITES),
                        "formeJuridique": None,
                        "natureIdentifiantDeposant": "CNIE",
                        "numeroIdentifiantDeposant": generate_cnie(),
                        "denominationSociale": None,
                        "nombreComptes": 1,
                        "isDecede": "N",
                        "nombreHeritiers": 0
                    },
                    "infosContact": generate_contact(titulaire_nom, titulaire_prenom, VILLES_TEST),
                    "representantLegal": [empty_rep()],
                    "heritier": [],
                    "compte": [compte]
                }
            }
            
            results.append(scv)
        
        return results
    
    
    @staticmethod
    def generate_legal_entity_account(count=5):
        """
        Génère des comptes pour personne morale (entreprise)
        
        Caractéristiques:
        - typePersonne = 'PM'
        - formeJuridique = SA|SARL|SNC|SCS|SCA
        - denominationSociale
        - numeroIdentifiantDeposant = RC (Registre de Commerce)
        - Compte peut être COL ou IND
        """
        results = []
        
        for i in range(count):
            # Forme juridique et dénomination
            forme = random.choice(FORMES_JURIDIQUES)
            denomination = random.choice(DENOMINATIONS)
            
            # Compte (peut être collectif ou individuel)
            is_collectif = random.random() < 0.6
            
            if is_collectif:
                nombre_total = random.randint(2, 3)
                nombre_cotit = nombre_total - 1
                parts = calculate_parts(nombre_cotit)
                cotitulaires = [
                    {
                        "idscv": generate_idscv(),
                        "partCoTitulaire": parts[j]
                    }
                    for j in range(nombre_cotit)
                ]
            else:
                nombre_total = 1
                cotitulaires = []
            
            compte = {
                "infosCompteBancaire": {
                    "rib": generate_rib(),
                    "natureCompte": "COL" if is_collectif else "IND",
                    "nombreCotitulaires": nombre_total if is_collectif else None,
                    "pcec": random.choice(["2038", "2041", "2050", "2100"]),
                    "devise": "MAD",
                    "nomCompte": f"Compte {denomination}",
                    "isCarteBancaire": "O",
                    "statutCompte": "STP",
                    "compteNSTP": None,
                    "autreCompteNSTP": None,
                    "sensSolde": "CRED",
                    "montantTotalSolde": random.randint(5000000000, 20000000000),
                    "montantTotalDettes": random.randint(500000000, 2000000000),
                    "montantTotalDebits": random.randint(5000000000, 15000000000),
                    "montantTotalAgios": 0,
                    "montantTotalGarantie": random.randint(1000000000, 5000000000),
                    "montantTotalInterets": 0
                },
                "prelevement": [
                    {
                        "montant": random.randint(2000000000, 5000000000),
                        "nature": "PS",
                        "natureAutre": None
                    }
                    for _ in range(random.randint(2, 4))
                ],
                "cotitulaire": cotitulaires,
                "infosCarteBancaire": [
                    {
                        "numeroCarte": generate_carte(),
                        "validite": f"0{random.choice([3,4,5])}/{random.choice([2033, 2035, 2037])}"
                    }
                    for _ in range(random.randint(1, 3))
                ]
            }
            
            scv = {
                "SCV": {
                    "identifiantDeposant": {
                        "idscv": generate_idscv(),
                        "version": 1,
                        "typePersonne": "PM",
                        "nom": denomination,
                        "prenom": None,
                        "dateNaissance": None,
                        "nationalite": "MA",
                        "formeJuridique": forme,
                        "natureIdentifiantDeposant": "RC",
                        "numeroIdentifiantDeposant": f"RC{random.randint(100000, 999999)}",
                        "denominationSociale": denomination,
                        "nombreComptes": random.randint(1, 3),
                        "isDecede": "N",
                        "nombreHeritiers": 0
                    },
                    "infosContact": {
                        "adresse1": f"Lot {random.randint(1, 100)} Boulevard {random.choice(QUARTIERS)}, Casablanca",
                        "adresse2": None,
                        "codePostal": None,
                        "ville": "20000",
                        "pays": "MA",
                        "mobile": generate_phone(True),
                        "fixe": generate_phone(False),
                        "email": f"{denomination.replace(' ', '-').lower()}@company.ma"
                    },
                    "representantLegal": [generate_representant_legal(VILLES_TEST)],
                    "heritier": [],
                    "compte": [compte]
                }
            }
            
            results.append(scv)
        
        return results
    
    
    @staticmethod
    def generate_normal_account(count=5):
        """
        Génère des comptes normaux (simples, individuels)
        
        Caractéristiques:
        - typePersonne = 'PP'
        - isDecede = 'N'
        - nombreHeritiers = 0
        - heritier[] = []
        - compte[] = compte simple
        """
        results = []
        
        for i in range(count):
            nom = random.choice(NOMS)
            prenom = random.choice(PRENOMS)
            
            # Compte simple (individuel)
            compte = {
                "infosCompteBancaire": {
                    "rib": generate_rib(),
                    "natureCompte": "IND",
                    "nombreCotitulaires": None,
                    "pcec": random.choice(["2038", "2041", "2050"]),
                    "devise": random.choice(["MAD", "EUR", "USD"]),
                    "nomCompte": f"Compte personnel {i+1}",
                    "isCarteBancaire": random.choice(["O", "N"]),
                    "statutCompte": random.choice(["STP", "NSTP"]),
                    "compteNSTP": None,
                    "autreCompteNSTP": None,
                    "sensSolde": random.choice(["DEB", "CRED"]),
                    "montantTotalSolde": random.randint(100000000, 2000000000),
                    "montantTotalDettes": random.randint(0, 200000000),
                    "montantTotalDebits": random.randint(100000000, 1500000000),
                    "montantTotalAgios": random.randint(0, 100000000),
                    "montantTotalGarantie": None,
                    "montantTotalInterets": random.randint(0, 50000000)
                },
                "prelevement": [
                    {
                        "montant": random.randint(100000000, 500000000),
                        "nature": random.choice(["LOYER", "PS", "CREDIT", "AUTRE"]),
                        "natureAutre": "Prélèvement automatique" if random.random() > 0.5 else None
                    }
                    for _ in range(random.randint(0, 2))
                ],
                "cotitulaire": [],
                "infosCarteBancaire": []
            }
            
            scv = {
                "SCV": {
                    "identifiantDeposant": {
                        "idscv": generate_idscv(),
                        "version": 1,
                        "typePersonne": "PP",
                        "nom": nom,
                        "prenom": prenom,
                        "dateNaissance": generate_date(1960, 1995),
                        "nationalite": random.choice(NATIONALITES),
                        "formeJuridique": None,
                        "natureIdentifiantDeposant": random.choice(["CNIE", "NR", "PASS"]),
                        "numeroIdentifiantDeposant": generate_cnie() if random.random() > 0.5 else generate_nr(),
                        "denominationSociale": None,
                        "nombreComptes": random.randint(1, 2),
                        "isDecede": "N",
                        "nombreHeritiers": 0
                    },
                    "infosContact": generate_contact(nom, prenom, VILLES_TEST),
                    "representantLegal": [empty_rep()],
                    "heritier": [],
                    "compte": [compte]
                }
            }
            
            results.append(scv)
        
        return results


def main():
    """Génère tous les fichiers de test"""
    
    print("🔄 SCVMaker - Génération des datasets SCV")
    print("=" * 60)
    
    # Répertoire de sortie
    output_dir = "data"
    
    # 1. Comptes avec héritiers
    print("\n📋 Génération de 5 comptes avec héritiers...")
    heirs_scvs = SCVMaker.generate_account_with_heirs(count=5)
    heirs_file = f"{output_dir}/scv_heirs.json"
    with open(heirs_file, 'w', encoding='utf-8') as f:
        json.dump(heirs_scvs, f, ensure_ascii=False, indent=2)
    print(f"✅ {heirs_file} généré ({len(heirs_scvs)} SCVs)")
    
    # 2. Comptes avec cotitulaires
    print("\n👥 Génération de 5 comptes avec cotitulaires...")
    cotitulaires_scvs = SCVMaker.generate_account_with_cotitulaires(count=5)
    cotitulaires_file = f"{output_dir}/scv_cotitulaires.json"
    with open(cotitulaires_file, 'w', encoding='utf-8') as f:
        json.dump(cotitulaires_scvs, f, ensure_ascii=False, indent=2)
    print(f"✅ {cotitulaires_file} généré ({len(cotitulaires_scvs)} SCVs)")
    
    # 3. Comptes de personnes morales
    print("\n🏢 Génération de 5 comptes de personnes morales...")
    legal_entity_scvs = SCVMaker.generate_legal_entity_account(count=5)
    legal_entity_file = f"{output_dir}/scv_legal_entities.json"
    with open(legal_entity_file, 'w', encoding='utf-8') as f:
        json.dump(legal_entity_scvs, f, ensure_ascii=False, indent=2)
    print(f"✅ {legal_entity_file} généré ({len(legal_entity_scvs)} SCVs)")
    
    # 4. Comptes normaux
    print("\n👤 Génération de 5 comptes normaux...")
    normal_scvs = SCVMaker.generate_normal_account(count=5)
    normal_file = f"{output_dir}/scv_normal.json"
    with open(normal_file, 'w', encoding='utf-8') as f:
        json.dump(normal_scvs, f, ensure_ascii=False, indent=2)
    print(f"✅ {normal_file} généré ({len(normal_scvs)} SCVs)")
    
    # 5. Fichier combiné (tous les types)
    print("\n📦 Création du fichier combiné...")
    all_scvs = heirs_scvs + cotitulaires_scvs + legal_entity_scvs + normal_scvs
    combined_file = f"{output_dir}/scv_all_types.json"
    with open(combined_file, 'w', encoding='utf-8') as f:
        json.dump(all_scvs, f, ensure_ascii=False, indent=2)
    print(f"✅ {combined_file} généré ({len(all_scvs)} SCVs total)")
    
    print("\n" + "=" * 60)
    print("✨ Génération complète!")
    print(f"📁 Fichiers générés:")
    print(f"   - {heirs_file}")
    print(f"   - {cotitulaires_file}")
    print(f"   - {legal_entity_file}")
    print(f"   - {normal_file}")
    print(f"   - {combined_file}")
    
    return {
        "heirs": heirs_scvs,
        "cotitulaires": cotitulaires_scvs,
        "legal_entities": legal_entity_scvs,
        "normal": normal_scvs,
        "all": all_scvs
    }


if __name__ == "__main__":
    main()
