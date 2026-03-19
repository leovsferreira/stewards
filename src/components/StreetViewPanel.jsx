import { useEffect, useRef } from "react";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

// ── Load Google Maps JS API once ─────────────────────────────────────────────

let gmapsPromise = null;

function loadGoogleMaps() {
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve) => {
    if (window.google?.maps?.StreetViewPanorama) { resolve(); return; }
    const script    = document.createElement("script");
    script.src      = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}`;
    script.async    = true;
    script.onload   = resolve;
    document.head.appendChild(script);
  });
  return gmapsPromise;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Props:
 *   panel        – { open, location: {lat,lng}, heading, loading, error }
 *   onClose      – () => void
 *   onPanoChange – ({ heading, lat, lng }) => void
 */
export function StreetViewPanel({ panel, onClose, onPanoChange }) {
  const containerRef = useRef(null);
  const panoRef      = useRef(null);

  useEffect(() => {
    if (!panel.open || !panel.location) return;

    let cancelled = false;

    loadGoogleMaps().then(() => {
      if (cancelled || !containerRef.current) return;

      // Destroy previous panorama if any
      if (panoRef.current) {
        window.google.maps.event.clearInstanceListeners(panoRef.current);
        panoRef.current = null;
      }

      const pano = new window.google.maps.StreetViewPanorama(containerRef.current, {
        position:              { lat: panel.location.lat, lng: panel.location.lng },
        pov:                   { heading: panel.heading, pitch: 0 },
        // ── Hide UI chrome ──────────────────────────────────────────
        addressControl:        false,
        zoomControl:           false,
        fullscreenControl:     false,
        panControl:            false,
        linksControl:          true,   // keep navigation arrows
        showRoadLabels:        false,
        motionTracking:        false,
        motionTrackingControl: false,
      });

      // Mirror heading + position back to the map marker
      pano.addListener("pov_changed", () => {
        onPanoChange({
          heading: pano.getPov().heading,
          lat:     pano.getPosition()?.lat(),
          lng:     pano.getPosition()?.lng(),
        });
      });

      pano.addListener("position_changed", () => {
        onPanoChange({
          heading: pano.getPov().heading,
          lat:     pano.getPosition()?.lat(),
          lng:     pano.getPosition()?.lng(),
        });
      });

      panoRef.current = pano;
    });

    return () => {
      cancelled = true;
      if (panoRef.current) {
        window.google.maps.event.clearInstanceListeners(panoRef.current);
        panoRef.current = null;
      }
    };
  }, [panel.location, panel.heading, panel.open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!panel.open) return null;

  return (
    <div className="svPanel">
      {/* ── Header ── */}
      <div className="svHeader">
        <span className="svTitle">Street View</span>
        <button className="svClose" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {/* ── Body ── */}
      <div className="svBody">
        {panel.loading && (
          <div className="svMessage">
            <span className="svSpinner" />
            Looking for imagery…
          </div>
        )}

        {!panel.loading && panel.error && (
          <div className="svMessage svError">{panel.error}</div>
        )}

        {/* Container always in DOM once open so the ref is stable */}
        <div
          ref={containerRef}
          className="svViewer"
          style={{ display: panel.location ? "block" : "none" }}
        />
      </div>
    </div>
  );
}