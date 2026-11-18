// Page d'accueil.
// NEXT_PUBLIC_CHAT_HOME=true : on arrive directement dans le chat (lot 4 de la refonte).
// Sinon (par défaut) : la page commerciale, comme avant. Elle reste aussi sur /decouvrir.
import ChatHome from '@/components/home/ChatHome';
import MarketingHome from '@/components/marketing/MarketingHome';
import { CHAT_HOME } from '@/lib/features';

export default function Home() {
    return CHAT_HOME ? <ChatHome /> : <MarketingHome />;
}
