"""
Populate fictitious ProcessMate users.

Usage:
  cd clinic
  python database/populate_users.py

Requires:
  pip install python-dotenv
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client


BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

PASSWORD = "ProcessMate123!"

USERS = [
    {
        "email": "philippe.processmate@example.com",
        "full_name": "Philippe",
        "job_title": "Responsable Conformité",
        "department": "Conformité",
        "global_role": "validator",
    },
    {
        "email": "youssef.processmate@example.com",
        "full_name": "Youssef",
        "job_title": "Process Owner",
        "department": "Organisation",
        "global_role": "process_owner",
    },
    {
        "email": "aymar.processmate@example.com",
        "full_name": "Aymar",
        "job_title": "Analyste Processus",
        "department": "Transformation",
        "global_role": "contributor",
    },
    {
        "email": "soumia.processmate@example.com",
        "full_name": "Soumia",
        "job_title": "Valideur Risque",
        "department": "Risque",
        "global_role": "validator",
    },
    {
        "email": "samira.processmate@example.com",
        "full_name": "Samira",
        "job_title": "Responsable Back Office",
        "department": "Back Office",
        "global_role": "validator",
    },
    {
        "email": "oussama.processmate@example.com",
        "full_name": "Oussama",
        "job_title": "Expert Applicatif",
        "department": "IT",
        "global_role": "contributor",
    },
    {
        "email": "karma.processmate@example.com",
        "full_name": "Karma",
        "job_title": "Auditeur Interne",
        "department": "Audit",
        "global_role": "viewer",
    },
]


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def find_user_by_email(supabase, email: str):
    page = 1
    per_page = 100

    while True:
        result = supabase.auth.admin.list_users(page=page, per_page=per_page)

        if isinstance(result, list):
            users = result
        else:
            users = result.users or []

        for user in users:
            if user.email and user.email.lower() == email.lower():
                return user

        if len(users) < per_page:
            return None

        page += 1



def create_or_get_auth_user(supabase, user_data: dict):
    email = user_data["email"]
    existing = find_user_by_email(supabase, email)

    if existing:
        print(f"Auth user already exists: {email} ({existing.id})")
        return existing

    created = supabase.auth.admin.create_user({
        "email": email,
        "password": PASSWORD,
        "email_confirm": True,
        "user_metadata": {
            "full_name": user_data["full_name"],
            "display_name": user_data["full_name"],
        },
    })

    print(f"Created auth user: {email} ({created.user.id})")
    return created.user


def upsert_profile(supabase, auth_user, user_data: dict):
    profile = {
        "id": auth_user.id,
        "email": user_data["email"],
        "full_name": user_data["full_name"],
        "display_name": user_data["full_name"],
        "job_title": user_data["job_title"],
        "department": user_data["department"],
        "entity": "ProcessMate",
        "global_role": user_data["global_role"],
        "status": "active",
    }

    supabase.table("user_profiles").upsert(profile).execute()
    print(f"Upserted profile: {user_data['full_name']}")


def main():
    supabase_url = get_required_env("SUPABASE_URL")
    supabase_service_key = get_required_env("SUPABASE_SERVICE_KEY")

    supabase = create_client(supabase_url, supabase_service_key)

    for user_data in USERS:
        auth_user = create_or_get_auth_user(supabase, user_data)
        upsert_profile(supabase, auth_user, user_data)

    print("Done.")


if __name__ == "__main__":
    main()
