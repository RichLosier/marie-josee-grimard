# Correctifs locaux sur les bibliothèques

- `ScrollTrigger.min.js` (gsap 3.15.0) : la boucle `_rafBugFix` (une requestAnimationFrame permanente, prévue pour un défaut de
  repeinture de Firefox) est neutralisée. La page garde une seule boucle d'animation : `gsap.ticker`, qui pilote aussi la scène 3D.
- Licences : three (MIT) ; gsap et ScrollTrigger (licence standard GSAP, gratuite).
