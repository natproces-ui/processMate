"""
Envoi d'emails depuis le backend Python (Gmail SMTP ou Resend).
Même template HTML que la route Next.js /api/notify/email.
"""
import json
import logging
import os
import smtplib
import urllib.request
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger(__name__)

TASK_TYPE_LABELS = {
    "formalization": "Formalisation",
    "review": "Vérification",
    "validation": "Validation",
    "consultation": "Consultation",
    "information": "Information",
    "correction": "Correction",
    "other": "Autre",
}


def _format_date(due_date: str) -> str:
    try:
        dt = datetime.fromisoformat(due_date[:10])
        months = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
                  "juil.", "août", "sept.", "oct.", "nov.", "déc."]
        return f"{dt.day} {months[dt.month - 1]} {dt.year}"
    except Exception:
        return due_date


def _build_html(
    to_name: str,
    to_email: str,
    assigned_by_name: str,
    task_title: str,
    procedure_name: Optional[str],
    type_label: str,
    due_date_label: Optional[str],
    workspace_url: Optional[str],
    task_description: Optional[str],
) -> str:
    proc_line = (
        f'<p style="margin:0 0 6px;color:#6b7280;font-size:14px;">'
        f'Procedure : {procedure_name}</p>'
    ) if procedure_name else ""
    due_line = (
        f'<p style="margin:0 0 6px;color:#6b7280;font-size:14px;">'
        f'Echeance : {due_date_label}</p>'
    ) if due_date_label else ""
    desc_line = (
        f'<p style="margin:10px 0 0;color:#374151;font-size:14px;'
        f'border-top:1px solid #e0eaff;padding-top:10px;">'
        f'{task_description}</p>'
    ) if task_description else ""

    if workspace_url:
        cta = f"""
        <div style="text-align:center;margin:24px 0;">
          <a href="{workspace_url}"
             style="display:inline-block;background:#2563eb;color:white;font-weight:bold;
                    font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
            Ouvrir dans le Workspace &rarr;
          </a>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;">
          ou copiez ce lien :
          <a href="{workspace_url}" style="color:#6b7280;">{workspace_url}</a>
        </p>
        """
    else:
        cta = (
            '<p style="color:#6b7280;font-size:14px;">'
            "Connectez-vous a ProcessMate pour consulter et traiter cette tache.</p>"
        )

    display = to_name or to_email
    return f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;">
  <div style="background:#2563eb;padding:20px 24px;border-radius:8px 8px 0 0;">
    <span style="color:white;font-size:18px;font-weight:bold;">ProcessMate</span>
  </div>
  <div style="background:white;padding:28px;border:1px solid #e5e7eb;
              border-top:none;border-radius:0 0 8px 8px;">
    <p style="color:#374151;font-size:15px;margin-top:0;">
      Bonjour <strong>{display}</strong>,
    </p>
    <p style="color:#374151;">
      Une nouvelle tache vous a ete assignee par <strong>{assigned_by_name}</strong>.
    </p>
    <div style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;
                padding:16px;margin:20px 0;">
      <p style="margin:0 0 10px;font-size:16px;font-weight:bold;color:#1e40af;">
        {task_title}
      </p>
      {proc_line}
      <p style="margin:0 0 6px;color:#6b7280;font-size:14px;">Type : {type_label}</p>
      {due_line}
      {desc_line}
    </div>
    {cta}
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;
              border-top:1px solid #f3f4f6;padding-top:12px;">
      Cet email a ete envoye automatiquement par ProcessMate. Ne pas repondre a ce message.
    </p>
  </div>
</div>
"""


def send_task_email(
    to_email: str,
    to_name: str,
    assigned_by_name: str,
    task_title: str,
    procedure_name: Optional[str] = None,
    task_type: str = "other",
    due_date: Optional[str] = None,
    workspace_url: Optional[str] = None,
    task_description: Optional[str] = None,
) -> None:
    """Envoie un email de notification de tâche. Silencieux en cas d'erreur."""
    if not to_email:
        return
    try:
        type_label = TASK_TYPE_LABELS.get(task_type, task_type)
        due_date_label = _format_date(due_date) if due_date else None

        html = _build_html(
            to_name=to_name or "",
            to_email=to_email,
            assigned_by_name=assigned_by_name,
            task_title=task_title,
            procedure_name=procedure_name,
            type_label=type_label,
            due_date_label=due_date_label,
            workspace_url=workspace_url,
            task_description=task_description,
        )
        subject = f"[ProcessMate] Nouvelle tache : {task_title}"

        email_user = os.environ.get("EMAIL_USER")
        email_pass = os.environ.get("EMAIL_PASS")
        resend_key = os.environ.get("RESEND_API_KEY")

        if email_user and email_pass:
            _send_gmail(to_email, subject, html, email_user, email_pass)
            logger.info(f"Email Gmail envoye a {to_email} — {task_title}")
        elif resend_key:
            _send_resend(to_email, subject, html, resend_key)
            logger.info(f"Email Resend envoye a {to_email} — {task_title}")
        else:
            logger.warning("send_task_email: aucun fournisseur email configure (EMAIL_USER/RESEND_API_KEY)")
    except Exception as exc:
        logger.warning(f"send_task_email echec vers {to_email}: {exc}")


def _send_gmail(to_email: str, subject: str, html: str, user: str, password: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"ProcessMate <{user}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))
    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.ehlo()
        server.starttls()
        server.login(user, password)
        server.sendmail(user, to_email, msg.as_string())


def _send_resend(to_email: str, subject: str, html: str, api_key: str) -> None:
    from_addr = os.environ.get("EMAIL_FROM", "ProcessMate <onboarding@resend.dev>")
    payload = json.dumps({
        "from": from_addr,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        if resp.status >= 400:
            body = resp.read()
            raise RuntimeError(f"Resend {resp.status}: {body}")
