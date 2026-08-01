'use client'

export default function Error({ error, reset }) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Something went wrong</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>{error?.message || 'An unexpected error occurred.'}</p>
      <button
        onClick={reset}
        style={{
          padding: '0.5rem 1rem',
          background: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '0.375rem',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}
