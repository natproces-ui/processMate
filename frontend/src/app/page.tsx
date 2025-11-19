// src/app/page.tsx
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <style jsx>{`
        .nav-link {
          display: block;
          padding: 1.25rem;
          color: white;
          text-decoration: none;
          border-radius: 12px;
          text-align: center;
          font-size: 1.1rem;
          font-weight: 600;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .nav-link:hover {
          transform: translateY(-2px);
        }
        
        .link-clinic {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        
        .link-clinic:hover {
          box-shadow: 0 8px 20px rgba(102, 126, 234, 0.5);
        }
        
        .link-stt {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          box-shadow: 0 4px 12px rgba(240, 147, 251, 0.4);
        }
        
        .link-stt:hover {
          box-shadow: 0 8px 20px rgba(240, 147, 251, 0.5);
        }
        
        .link-scv {
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
          box-shadow: 0 4px 12px rgba(79, 172, 254, 0.4);
        }
        
        .link-scv:hover {
          box-shadow: 0 8px 20px rgba(79, 172, 254, 0.5);
        }
        
        .link-new-stt {
          background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
          box-shadow: 0 4px 12px rgba(67, 233, 123, 0.4);
        }
        
        .link-new-stt:hover {
          box-shadow: 0 8px 20px rgba(67, 233, 123, 0.5);
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '3rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          maxWidth: '500px',
          width: '100%',
        }}>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            textAlign: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            ProcessMate
          </h1>

          <p style={{
            textAlign: 'center',
            color: '#64748b',
            marginBottom: '2rem',
            fontSize: '1.1rem',
          }}>
            Choisissez une application
          </p>

          <nav style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            <Link href="/clinic" className="nav-link link-clinic">
              🏥 Clinic
            </Link>

            <Link href="/stt" className="nav-link link-stt">
              🎤 STT (Speech to Text)
            </Link>

            <Link href="/scv-test" className="nav-link link-scv">
              📊 SCV Test
            </Link>

            <Link href="/new-stt-test" className="nav-link link-new-stt">
              🆕 New STT Test
            </Link>
          </nav>
        </div>
      </div>
    </>
  );
}