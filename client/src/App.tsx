import { useEffect } from "react";

// Redirect component to main HTML PWA
export default function App() {
  useEffect(() => {
    window.location.href = '/';
  }, []);
  
  return <div>Redirecting to PWA...</div>;
}
