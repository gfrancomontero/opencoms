import React from 'react';
import { acknowledgeSecurityScreen } from '../api';

interface Props {
  onComplete: () => void;
}

export default function SecurityScreen({ onComplete }: Props) {
  const handleContinue = async () => {
    await acknowledgeSecurityScreen();
    onComplete();
  };

  return (
    <div className="security-screen">
      <div className="security-card">
        <h2>Your Privacy Comes First</h2>
        <p className="subtitle">
          OpenComs runs entirely on your computer. Here's what that means:
        </p>

        <div className="security-item">
          <div className="security-icon">&#128274;</div>
          <div>
            <h3>Nothing leaves your computer</h3>
            <p>All your documents stay on your machine. No data is ever sent to any server, cloud, or third party.</p>
          </div>
        </div>

        <div className="security-item">
          <div className="security-icon">&#129302;</div>
          <div>
            <h3>AI runs locally</h3>
            <p>The AI model that reads and answers questions about your documents runs right here on your Mac. No external AI services are used.</p>
          </div>
        </div>

        <div className="security-item">
          <div className="security-icon">&#128451;</div>
          <div>
            <h3>Data stored locally</h3>
            <p>All indexes and search data are stored in a folder on your computer (~/.opencoms). You can delete it anytime.</p>
          </div>
        </div>

        <div className="security-item">
          <div className="security-icon">&#128683;</div>
          <div>
            <h3>No accounts, no tracking</h3>
            <p>There are no user accounts, no analytics, no telemetry, and no cookies. Your usage is completely private.</p>
          </div>
        </div>

        <div className="security-item">
          <div className="security-icon">&#9989;</div>
          <div>
            <h3>Works offline</h3>
            <p>After the initial setup, OpenComs works completely offline. No internet connection needed.</p>
          </div>
        </div>

        <div className="security-actions">
          <button className="btn btn-primary" onClick={handleContinue}>
            I understand — Continue
          </button>
        </div>
      </div>
    </div>
  );
}
