import React from 'react';

function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>FanSake App</h1>
      <p>Build Time: {new Date().toISOString()}</p>
      <p>If you see this, React is working!</p>
      <hr />
      <h2>Debug Info:</h2>
      <p>No auth providers loaded</p>
      <p>No routing loaded</p>
      <p>Just plain React</p>
    </div>
  );
}

export default App;