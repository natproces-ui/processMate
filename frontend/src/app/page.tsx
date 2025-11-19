// src/app/page.tsx
import Link from 'next/link';

export default function Home() {
  return (
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
          <Link
            href="/clinic"
            style={{
              display: 'block',
              padding: '1.25rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '12px',
              textAlign: 'center',
              fontSize: '1.1rem',
              fontWeight: '600',
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
            }}
          >
            🏥 Clinic
          </Link>

          <Link
            href="/stt"
            style={{
              display: 'block',
              padding: '1.25rem',
              background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '12px',
              textAlign: 'center',
              fontSize: '1.1rem',
              fontWeight: '600',
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxShadow: '0 4px 12px rgba(240, 147, 251, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(240, 147, 251, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(240, 147, 251, 0.4)';
            }}
          >
            🎤 STT (Speech to Text)
          </Link>

          <Link
            href="/scv-test"
            style={{
              display: 'block',
              padding: '1.25rem',
              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '12px',
              textAlign: 'center',
              fontSize: '1.1rem',
              fontWeight: '600',
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxShadow: '0 4px 12px rgba(79, 172, 254, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(79, 172, 254, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 172, 254, 0.4)';
            }}
          >
            📊 SCV Test
          </Link>

          <Link
            href="/new-stt-test"
            style={{
              display: 'block',
              padding: '1.25rem',
              background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '12px',
              textAlign: 'center',
              fontSize: '1.1rem',
              fontWeight: '600',
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxShadow: '0 4px 12px rgba(67, 233, 123, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(67, 233, 123, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(67, 233, 123, 0.4)';
            }}
          >
            🆕 New STT Test
          </Link>
        </nav>
      </div>
    </div>
  );
}