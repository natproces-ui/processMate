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


def _build_digest_html(
    to_name: str,
    to_email: str,
    assigned_by_name: str,
    tasks: list,
    workspace_url: Optional[str],
) -> str:
    display = to_name or to_email
    rows = ""
    for t in tasks:
        proc_line = (
            f'<p style="margin:2px 0 0;color:#6b7280;font-size:13px;">{t["procedure_name"]}</p>'
            if t.get("procedure_name") else ""
        )
        rows += f"""
        <div style="border-bottom:1px solid #e5e7eb;padding:10px 0;">
          <p style="margin:0;font-size:15px;font-weight:bold;color:#1e40af;">{t["title"]}</p>
          {proc_line}
        </div>
        """

    if workspace_url:
        cta = f"""
        <div style="text-align:center;margin:24px 0;">
          <a href="{workspace_url}"
             style="display:inline-block;background:#2563eb;color:white;font-weight:bold;
                    font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
            Ouvrir mes tâches &rarr;
          </a>
        </div>
        """
    else:
        cta = (
            '<p style="color:#6b7280;font-size:14px;">'
            "Connectez-vous a ProcessMate pour consulter et traiter ces taches.</p>"
        )

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
      <strong>{assigned_by_name}</strong> vous a assigne {len(tasks)} nouvelle{'s' if len(tasks) > 1 else ''}
      modification{'s' if len(tasks) > 1 else ''} a apporter a des procedures.
    </p>
    <div style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;
                padding:8px 16px;margin:20px 0;">
      {rows}
    </div>
    {cta}
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;
              border-top:1px solid #f3f4f6;padding-top:12px;">
      Cet email a ete envoye automatiquement par ProcessMate. Ne pas repondre a ce message.
    </p>
  </div>
</div>
"""


def send_tasks_digest_email(
    to_email: str,
    to_name: str,
    assigned_by_name: str,
    tasks: list,
    workspace_url: Optional[str] = None,
) -> None:
    """
    Envoie un seul email récapitulatif pour plusieurs tâches modification assignées en
    même temps à la même personne — évite une avalanche d'emails individuels quand un
    lot de propositions est converti en tâches d'un coup.
    `tasks` : liste de {"title": str, "procedure_name": str | None}.
    """
    if not to_email or not tasks:
        return
    try:
        html = _build_digest_html(
            to_name=to_name or "", to_email=to_email,
            assigned_by_name=assigned_by_name, tasks=tasks,
            workspace_url=workspace_url,
        )
        subject = (
            f"[ProcessMate] {len(tasks)} nouvelles modifications assignees"
            if len(tasks) > 1 else f"[ProcessMate] Nouvelle modification : {tasks[0]['title']}"
        )

        email_user = os.environ.get("EMAIL_USER")
        email_pass = os.environ.get("EMAIL_PASS")
        resend_key = os.environ.get("RESEND_API_KEY")

        if email_user and email_pass:
            _send_gmail(to_email, subject, html, email_user, email_pass)
            logger.info(f"Email digest Gmail envoye a {to_email} — {len(tasks)} tache(s)")
        elif resend_key:
            _send_resend(to_email, subject, html, resend_key)
            logger.info(f"Email digest Resend envoye a {to_email} — {len(tasks)} tache(s)")
        else:
            logger.warning("send_tasks_digest_email: aucun fournisseur email configure (EMAIL_USER/RESEND_API_KEY)")
    except Exception as exc:
        logger.warning(f"send_tasks_digest_email echec vers {to_email}: {exc}")


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


# ── Accès à un espace (lien pour choisir son mot de passe) ─────────────────────

def _esc(text: str) -> str:
    import html as _html
    return _html.escape(text or "")


def send_access_email(to_email: str, to_name: str, organisation: str, role_label: str, link: str,
                      invited_by: str = "processMate", existing_account: bool = False) -> bool:
    """E-mail d'accès : identifiant (l'e-mail) + lien pour choisir son mot de passe.

    Aucun mot de passe n'est envoyé. Renvoie True si l'e-mail est parti (pour le dire à
    l'expéditeur), False sinon — le lien reste alors affiché pour être transmis à la main.
    """
    if not to_email or not link:
        return False
    action = "définir un nouveau mot de passe" if existing_account else "choisir votre mot de passe"
    html = f"""<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
  <h2 style="font-size:18px">Votre accès à l'espace {_esc(organisation)}</h2>
  <p>Bonjour {_esc(to_name) or ''},</p>
  <p>{_esc(invited_by)} vous a ouvert un accès à processMate, dans l'espace <b>{_esc(organisation)}</b>
     (rôle : {_esc(role_label)}).</p>
  <p><b>Votre identifiant :</b> {_esc(to_email)}</p>
  <p>Cliquez ci-dessous pour {action}, puis connectez-vous avec votre identifiant.</p>
  <p style="margin:24px 0"><a href="{_esc(link)}" style="background:#0f172a;color:#fff;padding:10px 18px;
     border-radius:8px;text-decoration:none">Accéder à mon espace</a></p>
  <p style="font-size:12px;color:#64748b">Ce lien est personnel et valable pour une durée limitée. S'il a expiré,
     demandez-en un nouveau à la personne qui vous a invité.</p>
</div>"""
    subject = f"[ProcessMate] Votre accès à l'espace {organisation}"
    try:
        email_user, email_pass = os.environ.get("EMAIL_USER"), os.environ.get("EMAIL_PASS")
        resend_key = os.environ.get("RESEND_API_KEY")
        if email_user and email_pass:
            _send_gmail(to_email, subject, html, email_user, email_pass)
        elif resend_key:
            _send_resend(to_email, subject, html, resend_key)
        else:
            logger.warning("send_access_email: aucun fournisseur email configure (EMAIL_USER/RESEND_API_KEY)")
            return False
        logger.info(f"E-mail d'accès envoyé ({organisation})")
        return True
    except Exception as exc:
        logger.warning(f"send_access_email echec : {str(exc)[:160]}")
        return False
