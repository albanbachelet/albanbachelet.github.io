/* =========================================================
   RÉGLAGES
   ========================================================= */

// Les fils entre les zones : [zone de départ, zone d'arrivée, texte écrit sur le fil].
// Les cartes de la zone d'arrivée sont aussi reliées à sa punaise.
// Si tu ajoutes une zone (ex. id="cat4"), ajoute une ligne ici.
const LIENS = [
  ["moi", "cat1", "Projets Jeux Vidéo"],
  ["moi", "cat2", "Autres Projets"],
  ["moi", "cat3", "Prototypes"],
];

// La zone sur laquelle le site s'ouvre
const ZONE_DEPART = "moi";

// Zoom maximum quand la caméra se pose sur une zone
const ZOOM_MAX = 1.3;


/* =========================================================
   Le reste fonctionne tout seul, pas besoin d'y toucher
   pour modifier le contenu.
   ========================================================= */

const viewport = document.getElementById("viewport");
const board    = document.getElementById("board");
const svg      = document.getElementById("strings");
const tiroir      = document.getElementById("tiroir");
const fondTiroir  = document.getElementById("tiroir-fond");
const contenu     = document.getElementById("tiroir-contenu");
const visionneuse = document.getElementById("visionneuse");

const estMobile = () => window.matchMedia("(max-width: 800px)").matches;

let zoneActuelle = ZONE_DEPART; // id de la zone visée, ou "overview"
let carteOuverte = null;        // le projet affiché dans le tiroir
let camera = { x: 0, y: 0, s: 1 }; // position et zoom actuels de la caméra


/* ---------- Petits outils de géométrie ---------- */

// Position et taille d'un élément, en pixels, à l'intérieur du tableau
function rectDansTableau(el) {
  let x = 0, y = 0, e = el;
  while (e && e !== board) {
    x += e.offsetLeft;
    y += e.offsetTop;
    e = e.offsetParent;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function centre(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// Le point sur le bord du rectangle r, dans la direction d'un autre point
function pointSurBord(r, vers) {
  const c = centre(r);
  const dx = vers.x - c.x, dy = vers.y - c.y;
  const tx = dx ? (r.w / 2) / Math.abs(dx) : Infinity;
  const ty = dy ? (r.h / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}


/* ---------- Dessin des fils ---------- */

// Un fil légèrement affaissé entre deux points (courbe de Bézier)
// idA / idB = les zones aux deux bouts du fil (pour savoir où aller au clic)
function fil(a, b, idA, idB) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 + distance * 0.12; // l'affaissement
  const d = `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`;
  return `<path class="fil-clic" data-a="${idA}" data-b="${idB}" d="${d}"/>` +
         `<path class="fil" pathLength="1" d="${d}"/>`;
}

// Le texte écrit sur un fil, aligné sur sa pente.
// POSITION_ETIQUETTE : 0 = collé à la zone de départ, 0.5 = milieu du fil, 1 = à l'arrivée
const POSITION_ETIQUETTE = 0.3;

function etiquette(a, b, texte, idA, idB) {
  const t = POSITION_ETIQUETTE;
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  // Le point "de contrôle" qui donne sa courbe au fil (le même que dans fil())
  const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + distance * 0.12 };
  // Le point de la courbe à la position t
  const x = (1 - t) ** 2 * a.x + 2 * t * (1 - t) * c.x + t ** 2 * b.x;
  const y = (1 - t) ** 2 * a.y + 2 * t * (1 - t) * c.y + t ** 2 * b.y;
  // La direction du fil à cet endroit
  const dx = (1 - t) * (c.x - a.x) + t * (b.x - c.x);
  const dy = (1 - t) * (c.y - a.y) + t * (b.y - c.y);
  // L'angle, gardé à l'endroit (jamais la tête en bas)
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle > 90)  angle -= 180;
  if (angle < -90) angle += 180;
  return `<text class="etiquette" data-a="${idA}" data-b="${idB}" text-anchor="middle"
            transform="translate(${x} ${y}) rotate(${angle})" y="-14">${texte}</text>`;
}

function punaise(p) {
  return `<circle class="punaise" cx="${p.x}" cy="${p.y}" r="8"/>`;
}

function dessinerFils() {
  let fils = "";
  const punaises = [];

  LIENS.forEach(([idA, idB, texte]) => {
    const zoneA = document.getElementById(idA);
    const zoneB = document.getElementById(idB);
    if (!zoneA || !zoneB) return;

    const boxA = rectDansTableau(zoneA.querySelector(".box"));
    const boxB = rectDansTableau(zoneB.querySelector(".box"));
    const pA = pointSurBord(boxA, centre(boxB));
    const pB = pointSurBord(boxB, centre(boxA));

    fils += fil(pA, pB, idA, idB);
    if (texte) fils += etiquette(pA, pB, texte, idA, idB);
    punaises.push(pA, pB);

    // Chaque carte de la zone B est reliée à la punaise de B
    zoneB.querySelectorAll(".card").forEach(carte => {
      const r = rectDansTableau(carte);
      fils += fil({ x: r.x + r.w / 2, y: r.y }, pB, idB, idB);
    });
  });

  svg.innerHTML = fils + punaises.map(punaise).join("");
}


/* ---------- La caméra ---------- */

function cadrer(r, marge, zoomMax) {
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight - 60; // on laisse de la place au menu
  const s = Math.min((vw * marge) / r.w, (vh * marge) / r.h, zoomMax);
  const c = centre(r);
  const x = vw / 2 - c.x * s;
  const y = 60 + vh / 2 - c.y * s;
  placerCamera(x, y, s);
}

function placerCamera(x, y, s) {
  camera = { x, y, s };
  board.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
}

// Quand le tiroir est ouvert : la photo du projet se place
// au milieu de la bande de tableau encore visible à gauche
function cadrerSurCarte(carte) {
  const bande = viewport.clientWidth - tiroir.offsetWidth;
  if (estMobile() || bande < 150) return; // tiroir en pleine largeur : rien à montrer
  const c = centre(rectDansTableau(carte));
  const vh = viewport.clientHeight;
  placerCamera(bande / 2 - c.x * camera.s, vh / 2 - c.y * camera.s, camera.s);
}

function allerA(id) {
  zoneActuelle = id;

  // Menu : on met en valeur le bouton de la zone actuelle
  document.querySelectorAll(".menu button").forEach(b =>
    b.classList.toggle("actif", b.dataset.goto === id)
  );
  // Zones : seule la zone visée est "active"
  document.querySelectorAll(".zone").forEach(z =>
    z.classList.toggle("active", z.id === id)
  );

  if (estMobile()) {
    const cible = document.getElementById(id === "overview" ? ZONE_DEPART : id);
    cible.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (id === "overview") {
    cadrer({ x: 0, y: 0, w: board.offsetWidth, h: board.offsetHeight }, 0.95, 1);
  } else {
    cadrer(rectDansTableau(document.getElementById(id)), 0.85, ZOOM_MAX);
  }
}


/* ---------- Le tiroir (page projet) ---------- */

function ouvrirProjet(carte) {
  const details = carte.querySelector(".details");
  if (!details) return;
  contenu.innerHTML = details.innerHTML;

  // Petit rappel de la catégorie au-dessus du titre
  const titreZone = carte.closest(".zone").querySelector(".zone-title");
  const titre = contenu.querySelector("h3");
  if (titreZone && titre) {
    titre.insertAdjacentHTML("beforebegin", `<p class="tag">${titreZone.textContent}</p>`);
  }

  // En bas : projet précédent / suivant
  contenu.insertAdjacentHTML("beforeend", navigationProjets(carte));

  carteOuverte = carte;
  tiroir.scrollTop = 0;
  tiroir.classList.add("ouvert");
  fondTiroir.classList.add("ouvert");
  tiroir.querySelector(".tiroir-fermer").focus();
  cadrerSurCarte(carte);
}

// Tous les projets du tableau, dans l'ordre du fichier HTML
const tousLesProjets = () => [...document.querySelectorAll(".card")];

function navigationProjets(carte) {
  const liste = tousLesProjets();
  const i = liste.indexOf(carte);
  const prec = liste[i - 1];
  const suiv = liste[i + 1];
  const bouton = (c, sens, label) => c ? `
    <button class="${sens}" data-index="${liste.indexOf(c)}">
      <small>${label}</small>
      <strong>${c.querySelector("h3").textContent}</strong>
    </button>` : "";
  return `<nav class="navigation-projets">
    ${bouton(prec, "precedent", "← Projet précédent")}
    ${bouton(suiv, "suivant", "Projet suivant →")}
  </nav>`;
}

function changerDeProjet(carte) {
  const zone = carte.closest(".zone");
  if (zone.id !== zoneActuelle) allerA(zone.id); // la caméra suit sur le tableau
  ouvrirProjet(carte);
}

function fermerProjet() {
  if (!carteOuverte) return;
  carteOuverte = null;
  tiroir.classList.remove("ouvert");
  fondTiroir.classList.remove("ouvert");
  allerA(zoneActuelle); // la caméra revient sur la catégorie
  // On vide le tiroir une fois l'animation finie (arrête une éventuelle vidéo)
  setTimeout(() => { if (!carteOuverte) contenu.innerHTML = ""; }, 500);
}


/* ---------- Image agrandie ---------- */

function agrandirImage(element) {
  const copie = element.cloneNode(true);
  copie.classList.add("agrandie");
  visionneuse.innerHTML = "";
  visionneuse.appendChild(copie);
  visionneuse.hidden = false;
}

function fermerImage() {
  visionneuse.hidden = true;
  visionneuse.innerHTML = "";
}


/* ---------- Interactions ---------- */

// Boutons du menu
document.querySelectorAll(".menu button").forEach(bouton =>
  bouton.addEventListener("click", () => allerA(bouton.dataset.goto))
);

// Clic sur un fil → on va à l'autre bout du fil
svg.addEventListener("click", e => {
  const f = e.target.closest(".fil-clic, .etiquette");
  if (!f) return;
  e.stopPropagation();
  const { a, b } = f.dataset;
  allerA(zoneActuelle === b ? a : b);
});

// Clic sur une zone qui n'est pas au centre → la caméra y va
document.querySelectorAll(".zone").forEach(zone =>
  zone.addEventListener("click", () => {
    if (zoneActuelle !== zone.id) allerA(zone.id);
  })
);

// Clic sur un projet → d'abord on va sur sa zone, puis on ouvre le détail
document.querySelectorAll(".card").forEach(carte => {
  const agir = (e) => {
    e.stopPropagation();
    const zone = carte.closest(".zone");
    if (!estMobile() && zoneActuelle !== zone.id) {
      allerA(zone.id);
    } else {
      ouvrirProjet(carte);
    }
  };
  carte.addEventListener("click", agir);
  carte.addEventListener("keydown", e => { if (e.key === "Enter") agir(e); });
});

// Fermer le tiroir : bouton ✕ ou clic sur la bande de tableau
tiroir.querySelector(".tiroir-fermer").addEventListener("click", fermerProjet);
fondTiroir.addEventListener("click", fermerProjet);

// Clic sur une image du tiroir → plein écran ; clic n'importe où → on referme
contenu.addEventListener("click", e => {
  const nav = e.target.closest(".navigation-projets button");
  if (nav) { changerDeProjet(tousLesProjets()[nav.dataset.index]); return; }
  const figure = e.target.closest("figure");
  if (figure && figure.firstElementChild) agrandirImage(figure.firstElementChild);
});
visionneuse.addEventListener("click", fermerImage);

// Touche Échap : d'abord l'image, puis le tiroir, puis vue d'ensemble
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!visionneuse.hidden) fermerImage();
  else if (carteOuverte) fermerProjet();
  else if (zoneActuelle !== "overview") allerA("overview");
});

// Si la fenêtre change de taille, on redessine et on recadre
window.addEventListener("resize", () => {
  dessinerFils();
  allerA(zoneActuelle);
  if (carteOuverte) cadrerSurCarte(carteOuverte);
});


/* ---------- Démarrage ---------- */
window.addEventListener("load", () => {
  // Les fils se dessinent une seule fois, à l'arrivée sur le site
  svg.classList.add("dessin");
  setTimeout(() => svg.classList.remove("dessin"), 2000);
  dessinerFils();
  allerA(ZONE_DEPART);
  // On active l'animation seulement après le premier cadrage
  requestAnimationFrame(() => board.classList.add("anim"));
});
