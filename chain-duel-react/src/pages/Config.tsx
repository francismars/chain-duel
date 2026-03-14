import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { loadConfig } from '@/lib/config';
import './config.css';

export default function Config() {
  const navigate = useNavigate();
  const [backendIP, setBackendIP] = useState<string>('marspay.chainduel.net');
  const [hostName, setHostName] = useState<string>('default');
  const [hostLNAddress, setHostLNAddress] = useState<string>('default');
  const [isEditingHostName, setIsEditingHostName] = useState(false);
  const [isEditingLNAddress, setIsEditingLNAddress] = useState(false);
  const [editHostNameValue, setEditHostNameValue] = useState<string>('');
  const [editLNAddressValue, setEditLNAddressValue] = useState<string>('');
  const hostNameInputRef = useRef<HTMLInputElement>(null);
  const lnAddressInputRef = useRef<HTMLInputElement>(null);

  // Load config and localStorage values on mount
  useEffect(() => {
    // Load backend config
    loadConfig()
      .then((config) => {
        setBackendIP(config.IP || 'marspay.chainduel.net');
      })
      .catch((error) => {
        console.error('Failed to load config:', error);
      });

    // Load from localStorage
    const savedHostName = localStorage.getItem('hostName') || 'default';
    const savedHostLNAddress = localStorage.getItem('hostLNAddress') || 'default';
    setHostName(savedHostName);
    setHostLNAddress(savedHostLNAddress);
  }, []);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingHostName && hostNameInputRef.current) {
      hostNameInputRef.current.focus();
      hostNameInputRef.current.setSelectionRange(
        editHostNameValue.length,
        editHostNameValue.length
      );
    }
  }, [isEditingHostName, editHostNameValue.length]);

  useEffect(() => {
    if (isEditingLNAddress && lnAddressInputRef.current) {
      lnAddressInputRef.current.focus();
      lnAddressInputRef.current.setSelectionRange(
        editLNAddressValue.length,
        editLNAddressValue.length
      );
    }
  }, [isEditingLNAddress, editLNAddressValue.length]);

  const handleCancelHostName = useCallback(() => {
    setEditHostNameValue(hostName);
    setIsEditingHostName(false);
  }, [hostName]);

  const handleCancelLNAddress = useCallback(() => {
    setEditLNAddressValue(hostLNAddress);
    setIsEditingLNAddress(false);
  }, [hostLNAddress]);

  // Handle click outside to cancel
  useEffect(() => {
    if (!isEditingHostName && !isEditingLNAddress) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        isEditingHostName &&
        hostNameInputRef.current &&
        !hostNameInputRef.current.contains(target) &&
        target.id !== 'hostNameChange'
      ) {
        handleCancelHostName();
      }
      if (
        isEditingLNAddress &&
        lnAddressInputRef.current &&
        !lnAddressInputRef.current.contains(target) &&
        target.id !== 'hostLNAddressChange'
      ) {
        handleCancelLNAddress();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [
    isEditingHostName,
    isEditingLNAddress,
    hostName,
    hostLNAddress,
    handleCancelHostName,
    handleCancelLNAddress,
  ]);

  const handleEditHostName = () => {
    setEditHostNameValue(hostName);
    setIsEditingHostName(true);
  };

  const handleSaveHostName = () => {
    const trimmedValue = editHostNameValue.trim();
    if (trimmedValue === 'default' || trimmedValue === '') {
      localStorage.removeItem('hostName');
      setHostName('default');
    } else {
      localStorage.setItem('hostName', trimmedValue);
      setHostName(trimmedValue);
    }
    setIsEditingHostName(false);
  };

  const handleEditLNAddress = () => {
    setEditLNAddressValue(hostLNAddress);
    setIsEditingLNAddress(true);
  };

  const handleSaveLNAddress = () => {
    const trimmedValue = editLNAddressValue.trim();
    const lightningAddressRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      trimmedValue === 'default' ||
      trimmedValue === '' ||
      !lightningAddressRegex.test(trimmedValue)
    ) {
      localStorage.removeItem('hostLNAddress');
      setHostLNAddress('default');
    } else {
      localStorage.setItem('hostLNAddress', trimmedValue);
      setHostLNAddress(trimmedValue);
    }
    setIsEditingLNAddress(false);
  };

  const handleResetConfig = () => {
    localStorage.removeItem('hostName');
    localStorage.removeItem('hostLNAddress');
    setHostName('default');
    setHostLNAddress('default');
  };

  const handleHostNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveHostName();
    } else if (e.key === 'Escape') {
      handleCancelHostName();
    }
  };

  const handleLNAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveLNAddress();
    } else if (e.key === 'Escape') {
      handleCancelLNAddress();
    }
  };

  return (
    <div className="flex full flex-center config-page">
      <p className="page-title label">Config</p>
      <div className="config-rows">
        {/* Backend IP - Read Only */}
        <div className="config-row">
          <div className="config-row-text">
            <div className="label">Backend</div>
            <div className="value" id="backEndIP">
              {backendIP}
            </div>
          </div>
          <Button className="disabled" id="backEndIPChange" disabled>
            Change
          </Button>
        </div>

        {/* Host Name - Editable */}
        <div className="config-row">
          <div className="config-row-text">
            <div className="label">Host Name</div>
            <div className="value" id="hostName">
              {isEditingHostName ? (
                <input
                  ref={hostNameInputRef}
                  type="text"
                  id="hostNameInput"
                  value={editHostNameValue}
                  onChange={(e) => setEditHostNameValue(e.target.value)}
                  onKeyDown={handleHostNameKeyDown}
                  className="value"
                />
              ) : (
                hostName
              )}
            </div>
          </div>
          <Button
            id="hostNameChange"
            onClick={isEditingHostName ? handleSaveHostName : handleEditHostName}
          >
            {isEditingHostName ? 'Save' : 'Change'}
          </Button>
        </div>

        {/* Host LN Address - Editable */}
        <div className="config-row">
          <div className="config-row-text">
            <div className="label">Host LN Address</div>
            <div className="value" id="hostLNAddress">
              {isEditingLNAddress ? (
                <input
                  ref={lnAddressInputRef}
                  type="text"
                  id="hostLNAddressInput"
                  value={editLNAddressValue}
                  onChange={(e) => setEditLNAddressValue(e.target.value)}
                  onKeyDown={handleLNAddressKeyDown}
                  className="value"
                />
              ) : (
                hostLNAddress
              )}
            </div>
          </div>
          <Button
            id="hostLNAddressChange"
            onClick={isEditingLNAddress ? handleSaveLNAddress : handleEditLNAddress}
          >
            {isEditingLNAddress ? 'Save' : 'Change'}
          </Button>
        </div>

        {/* Disabled Rows */}
        <div className="config-row disabled">
          <div className="config-row-text">
            <div className="label">Top Brand Image</div>
            <div className="value" id="topBrandImage">
              default
            </div>
          </div>
          <Button>
            Change
          </Button>
        </div>

        <div className="config-row disabled">
          <div className="config-row-text">
            <div className="label">Brand Image Label</div>
            <div className="value" id="topBrandImageLabel">
              default
            </div>
          </div>
          <Button>
            Change
          </Button>
        </div>

        <div className="config-row disabled">
          <div className="config-row-text">
            <div className="label">Controlers</div>
            <div className="value" id="gamepadeDetected">
              No gamepad detected
            </div>
          </div>
          <Button>
            Config
          </Button>
        </div>

        <div className="config-row disabled">
          <div className="config-row-text">
            <div className="label">Sound</div>
            <div className="value">
              Music <span id="musicStatus">ON</span> / Sound Effect{' '}
              <span id="sfxStatus">ON</span>
            </div>
          </div>
          <Button>
            Edit
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="double-button">
          <Button id="resetButton" onClick={handleResetConfig}>
            Reset
          </Button>
          <Button id="backButton" onClick={() => navigate('/')}>
            Main Menu
          </Button>
        </div>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </div>
  );
}
