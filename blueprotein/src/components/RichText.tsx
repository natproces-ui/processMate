/** Renders admin-authored TipTap HTML. Content is only ever written by the
 * authenticated admin (gated by the `admins` table via RLS), not public
 * user input, so this is not sanitized against arbitrary HTML. */
export default function RichText({ html, className = '' }: { html: string; className?: string }) {
  return <div className={`rich-content ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
