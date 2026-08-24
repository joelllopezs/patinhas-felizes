const { upload: uploadBlob } = require('@vercel/blob/client');

(function () {
  'use strict';

  const DEFAULT_CONFIG = {
    hoje: new Date().toISOString().slice(0, 10),
    pixKey: '(14) 99720-0278',
    telefoneAtendimento: '5514991937562',
    limiteVagasDiario: 15,
    maxPets: 10,
    maxDiasHospedagem: 60,
    maxDiasCreche: 31,
    maxDiasDomiciliar: 60,
    maxComprovanteMB: 5,
    precos: {
      hospedagem: 60,
      creche: { 1: 160, 2: 280, 3: 360, 4: 440, 5: 520 },
      domiciliar: { 1: 50, 2: 100 },
      sinal: 60,
    },
  };

  const SERVICE_LABELS = {
    hospedagem_cao: 'Hospedagem para Cães',
    hospedagem_gato: 'Hospedagem para Gatos',
    creche: 'Creche Pet',
    domiciliar: 'Atendimento Domiciliar',
  };

  const WEEKDAY_LABELS = {
    1: 'Segunda-feira',
    2: 'Terça-feira',
    3: 'Quarta-feira',
    4: 'Quinta-feira',
    5: 'Sexta-feira',
  };

  const STEPS = [
    'service',
    'tutor',
    'details',
    'pets',
    'review',
    'payment',
    'success',
  ];

  let config = { ...DEFAULT_CONFIG };
  let serverReady = false;
  let state = createInitialState();

  const form = document.getElementById('wizardForm');
  const errorEl = document.getElementById('formError');
  const btnBack = document.getElementById('btnBack');
  const btnNext = document.getElementById('btnNext');
  const wizardNav = document.getElementById('wizardNav');
  const pawProgress = document.getElementById('pawProgress');
  const humanCareNotice = document.getElementById('humanCareNotice');
  const selectedServiceAnimation = document.getElementById(
    'selectedServiceAnimation'
  );

  function createInitialState() {
    return {
      stepIndex: 0,
      service: null,
      nomeTutor: '',
      telefoneTutor: '',
      details: {},
      pets: [],
      observacao: '',
      preview: null,
      comprovante: null,
      result: null,
    };
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  function formatDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      return 'Não informada';
    }

    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
  }

  function addDaysISO(iso, days) {
    if (!iso) return '';

    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    date.setUTCDate(date.getUTCDate() + Number(days || 0));

    return date.toISOString().slice(0, 10);
  }

  function inclusiveDays(start, end) {
    if (!start || !end) return 0;

    const a = new Date(`${start}T00:00:00Z`);
    const b = new Date(`${end}T00:00:00Z`);

    return Math.round((b - a) / 86400000) + 1;
  }

  function calculateHotelNights(
  dataEntrada,
  horaEntrada,
  dataSaida,
  horaSaida
) {
  if (
    !dataEntrada ||
    !horaEntrada ||
    !dataSaida ||
    !horaSaida
  ) {
    return 0;
  }

  const entrada = new Date(
    `${dataEntrada}T${horaEntrada}:00`
  );

  const saida = new Date(
    `${dataSaida}T${horaSaida}:00`
  );

  if (
    Number.isNaN(entrada.getTime()) ||
    Number.isNaN(saida.getTime()) ||
    saida < entrada
  ) {
    return 0;
  }

  const diffMs =
    saida.getTime() -
    entrada.getTime();

  const horas =
    diffMs / (1000 * 60 * 60);

  return Math.max(
    1,
    Math.ceil(horas / 24)
  );
}

  function serviceAnimationMarkup(service) {
    const scenes = {
      hospedagem_cao: `
        <div class="service-story service-story-dog" aria-label="Animação de hotel para cães">
          <svg class="story-svg" viewBox="0 0 760 250" role="img" aria-hidden="true">
            <defs>
              <linearGradient id="dogSky" x1="0" x2="1">
                <stop offset="0%" stop-color="#FFF4D8"/>
                <stop offset="100%" stop-color="#F7DFC0"/>
              </linearGradient>
              <linearGradient id="dogGrass" x1="0" x2="1">
                <stop offset="0%" stop-color="#BFD9A8"/>
                <stop offset="100%" stop-color="#9FC48E"/>
              </linearGradient>
            </defs>

            <rect class="story-sky" x="0" y="0" width="760" height="250" rx="24" fill="url(#dogSky)"/>
            <circle class="story-sun dog-sun" cx="650" cy="55" r="28" fill="#F0B429"/>
            <g class="story-cloud dog-cloud">
              <ellipse cx="95" cy="48" rx="28" ry="14" fill="#fff" opacity=".9"/>
              <ellipse cx="120" cy="42" rx="22" ry="18" fill="#fff" opacity=".9"/>
              <ellipse cx="144" cy="49" rx="28" ry="13" fill="#fff" opacity=".9"/>
            </g>

            <path d="M0 180 Q100 155 200 180 T400 180 T600 180 T760 180 V250 H0Z" fill="url(#dogGrass)"/>
            <path d="M304 250 C316 220 335 197 373 188 C414 198 434 221 447 250Z" fill="#E7C99F"/>

            <g class="dog-hotel">
              <rect x="255" y="78" width="250" height="125" rx="10" fill="#FFFDF7" stroke="#2C4A3B" stroke-width="5"/>
              <path d="M232 91 L380 28 L528 91Z" fill="#E2703A" stroke="#2C4A3B" stroke-width="5" stroke-linejoin="round"/>
              <rect x="347" y="130" width="66" height="73" rx="30 30 4 4" fill="#2C4A3B"/>
              <rect x="278" y="112" width="49" height="44" rx="8" fill="#D8ECF0" stroke="#2C4A3B" stroke-width="4"/>
              <path d="M302 112 V156 M278 134 H327" stroke="#2C4A3B" stroke-width="3"/>
              <rect x="435" y="112" width="49" height="44" rx="8" fill="#D8ECF0" stroke="#2C4A3B" stroke-width="4"/>
              <path d="M459 112 V156 M435 134 H484" stroke="#2C4A3B" stroke-width="3"/>
              <rect x="312" y="58" width="136" height="34" rx="17" fill="#F0B429" stroke="#2C4A3B" stroke-width="4"/>
              <text x="380" y="81" text-anchor="middle" class="story-sign-text">HOTEL PET</text>
            </g>

            <g class="dog-bowl">
              <ellipse cx="548" cy="214" rx="28" ry="9" fill="#B14F27" opacity=".2"/>
              <path d="M522 195 Q548 208 574 195 L568 216 Q548 225 528 216Z" fill="#E2703A" stroke="#2C4A3B" stroke-width="3"/>
              <circle cx="540" cy="199" r="4" fill="#805B3C"/>
              <circle cx="550" cy="201" r="4" fill="#805B3C"/>
              <circle cx="560" cy="198" r="4" fill="#805B3C"/>
            </g>

            <g class="dog-bed">
              <ellipse cx="635" cy="214" rx="43" ry="12" fill="#D5A89F"/>
              <rect x="599" y="191" width="72" height="25" rx="13" fill="#F3C6C0" stroke="#2C4A3B" stroke-width="3"/>
              <ellipse cx="635" cy="196" rx="25" ry="8" fill="#FFF4EE"/>
            </g>

            <g class="dog-character dog-character-one">
              <ellipse class="dog-shadow" cx="145" cy="222" rx="42" ry="10" fill="#1E3329" opacity=".14"/>
              <g class="dog-body-group">
                <ellipse cx="145" cy="186" rx="39" ry="31" fill="#C9874E" stroke="#2C4A3B" stroke-width="4"/>
                <circle cx="127" cy="158" r="27" fill="#D99B61" stroke="#2C4A3B" stroke-width="4"/>
                <ellipse class="dog-ear-left" cx="108" cy="143" rx="12" ry="22" fill="#8E5B35" transform="rotate(-28 108 143)"/>
                <ellipse class="dog-ear-right" cx="145" cy="142" rx="12" ry="22" fill="#8E5B35" transform="rotate(24 145 142)"/>
                <circle cx="119" cy="155" r="3.6" fill="#1E3329"/>
                <circle cx="137" cy="155" r="3.6" fill="#1E3329"/>
                <ellipse cx="128" cy="166" rx="7" ry="5" fill="#1E3329"/>
                <path d="M128 170 Q128 179 138 178" fill="none" stroke="#1E3329" stroke-width="3" stroke-linecap="round"/>
                <path class="dog-tail-one" d="M180 176 Q204 157 210 181" fill="none" stroke="#8E5B35" stroke-width="10" stroke-linecap="round"/>
                <rect x="119" y="206" width="11" height="24" rx="5" fill="#8E5B35"/>
                <rect x="155" y="206" width="11" height="24" rx="5" fill="#8E5B35"/>
                <path d="M112 180 Q145 194 177 180" fill="none" stroke="#F0B429" stroke-width="7"/>
                <circle cx="145" cy="190" r="7" fill="#F0B429" stroke="#2C4A3B" stroke-width="2"/>
              </g>
            </g>

            <g class="dog-character dog-character-two">
              <ellipse class="dog-shadow" cx="239" cy="225" rx="33" ry="8" fill="#1E3329" opacity=".12"/>
              <g class="dog-body-group dog-two-hop">
                <ellipse cx="238" cy="193" rx="31" ry="25" fill="#FFF6E9" stroke="#2C4A3B" stroke-width="4"/>
                <circle cx="231" cy="168" r="22" fill="#FFF6E9" stroke="#2C4A3B" stroke-width="4"/>
                <path d="M216 153 Q203 139 207 126 Q226 134 225 151Z" fill="#70523D" stroke="#2C4A3B" stroke-width="3"/>
                <path d="M243 152 Q252 136 264 132 Q267 149 252 160Z" fill="#70523D" stroke="#2C4A3B" stroke-width="3"/>
                <circle cx="224" cy="166" r="3" fill="#1E3329"/>
                <circle cx="239" cy="166" r="3" fill="#1E3329"/>
                <circle cx="232" cy="174" r="4.5" fill="#1E3329"/>
                <path class="dog-tail-two" d="M267 185 Q286 170 288 190" fill="none" stroke="#70523D" stroke-width="8" stroke-linecap="round"/>
                <rect x="220" y="209" width="9" height="19" rx="4" fill="#70523D"/>
                <rect x="247" y="209" width="9" height="19" rx="4" fill="#70523D"/>
              </g>
            </g>

            <g class="story-paw-trail dog-paw-trail">
              <text x="48" y="212">🐾</text>
              <text x="76" y="188">🐾</text>
              <text x="101" y="218">🐾</text>
              <text x="128" y="191">🐾</text>
            </g>

            <g class="story-heart dog-heart">
              <path d="M192 116 C182 102 158 111 164 130 C171 147 192 158 192 158 C192 158 214 146 220 130 C227 111 202 102 192 116Z" fill="#E2703A"/>
            </g>

            <g class="story-bone">
              <path d="M588 142 C579 135 567 141 568 151 C558 151 554 164 564 170 C561 181 574 186 581 178 L615 151 C622 157 634 151 632 141 C642 136 637 123 627 124 C625 113 612 112 607 122Z" fill="#FFFDF7" stroke="#2C4A3B" stroke-width="3"/>
            </g>
          </svg>

          <div class="story-copy">
            <strong>Uma estadia cheia de cuidado 🐾</strong>
            <span>Conforto, companhia e rotina para o seu cão se sentir em casa.</span>
          </div>
        </div>
      `,

      hospedagem_gato: `
        <div class="service-story service-story-cat" aria-label="Animação de hotel para gatos">
          <svg class="story-svg" viewBox="0 0 760 250" role="img" aria-hidden="true">
            <defs>
              <linearGradient id="catRoom" x1="0" x2="1">
                <stop offset="0%" stop-color="#EDE7F5"/>
                <stop offset="100%" stop-color="#F8EBD7"/>
              </linearGradient>
            </defs>

            <rect x="0" y="0" width="760" height="250" rx="24" fill="url(#catRoom)"/>
            <rect x="0" y="198" width="760" height="52" fill="#D8BE9D"/>

            <g class="cat-window">
              <rect x="70" y="35" width="145" height="112" rx="12" fill="#263B4A" stroke="#2C4A3B" stroke-width="5"/>
              <circle class="cat-moon" cx="174" cy="66" r="22" fill="#F8E7A4"/>
              <circle cx="184" cy="61" r="22" fill="#263B4A"/>
              <circle class="cat-star cat-star-one" cx="104" cy="63" r="4" fill="#FFF4B8"/>
              <circle class="cat-star cat-star-two" cx="137" cy="90" r="3" fill="#FFF4B8"/>
              <circle class="cat-star cat-star-three" cx="191" cy="111" r="3" fill="#FFF4B8"/>
              <path d="M143 35 V147 M70 91 H215" stroke="#F4EEE4" stroke-width="3" opacity=".45"/>
            </g>

            <g class="cat-scratcher">
              <rect x="525" y="91" width="14" height="106" rx="7" fill="#9A754F"/>
              <rect x="495" y="188" width="75" height="13" rx="7" fill="#6E563F"/>
              <rect x="495" y="80" width="75" height="14" rx="7" fill="#6E563F"/>
              <path d="M506 96 H556 M506 106 H556 M506 116 H556 M506 126 H556 M506 136 H556 M506 146 H556 M506 156 H556 M506 166 H556 M506 176 H556" stroke="#D1B084" stroke-width="3"/>
              <line x1="533" y1="80" x2="533" y2="52" stroke="#2C4A3B" stroke-width="3"/>
              <circle class="cat-hanging-toy" cx="533" cy="45" r="10" fill="#E2703A"/>
            </g>

            <g class="cat-bed">
              <ellipse cx="646" cy="209" rx="53" ry="14" fill="#6C8B77" opacity=".22"/>
              <path d="M590 185 Q646 158 702 185 L692 218 Q646 235 600 218Z" fill="#F3C6C0" stroke="#2C4A3B" stroke-width="4"/>
              <ellipse cx="646" cy="191" rx="39" ry="14" fill="#FFF7EE"/>
            </g>

            <g class="cat-character cat-character-main">
              <ellipse cx="359" cy="220" rx="42" ry="9" fill="#1E3329" opacity=".12"/>
              <g class="cat-main-body">
                <ellipse cx="358" cy="184" rx="38" ry="34" fill="#B9A1D8" stroke="#2C4A3B" stroke-width="4"/>
                <circle cx="356" cy="145" r="29" fill="#C8B2E2" stroke="#2C4A3B" stroke-width="4"/>
                <path d="M335 128 L341 104 L354 125Z" fill="#C8B2E2" stroke="#2C4A3B" stroke-width="4"/>
                <path d="M375 127 L381 103 L392 132Z" fill="#C8B2E2" stroke="#2C4A3B" stroke-width="4"/>
                <path d="M339 123 L343 112 L349 124Z" fill="#F3C6C0"/>
                <path d="M378 123 L381 112 L386 126Z" fill="#F3C6C0"/>
                <ellipse class="cat-eye-left" cx="346" cy="144" rx="4" ry="7" fill="#1E3329"/>
                <ellipse class="cat-eye-right" cx="369" cy="144" rx="4" ry="7" fill="#1E3329"/>
                <path d="M353 157 L360 157 L356 162Z" fill="#E2703A"/>
                <path d="M356 162 Q350 168 344 163 M356 162 Q362 168 368 163" fill="none" stroke="#1E3329" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M332 154 L306 149 M332 160 L304 162 M379 154 L405 149 M379 160 L407 163" stroke="#2C4A3B" stroke-width="2" stroke-linecap="round"/>
                <path class="cat-tail-main" d="M390 181 Q432 159 421 125 Q414 108 398 117" fill="none" stroke="#B9A1D8" stroke-width="13" stroke-linecap="round"/>
                <rect x="336" y="207" width="12" height="22" rx="6" fill="#9C84BE"/>
                <rect x="369" y="207" width="12" height="22" rx="6" fill="#9C84BE"/>
              </g>
            </g>

            <g class="cat-character cat-character-peek">
              <g class="cat-peek-body">
                <circle cx="654" cy="174" r="25" fill="#E8A85D" stroke="#2C4A3B" stroke-width="4"/>
                <path d="M636 158 L638 137 L651 156Z" fill="#E8A85D" stroke="#2C4A3B" stroke-width="3"/>
                <path d="M670 156 L680 138 L687 163Z" fill="#E8A85D" stroke="#2C4A3B" stroke-width="3"/>
                <circle cx="647" cy="174" r="3" fill="#1E3329"/>
                <circle cx="663" cy="174" r="3" fill="#1E3329"/>
                <path d="M652 184 L658 184 L655 188Z" fill="#E2703A"/>
              </g>
            </g>

            <g class="cat-yarn">
              <circle cx="276" cy="210" r="19" fill="#E2703A" stroke="#2C4A3B" stroke-width="3"/>
              <path d="M263 202 Q278 216 288 196 M261 213 Q279 198 292 215 M271 192 Q274 211 293 207" fill="none" stroke="#FBD2B9" stroke-width="3"/>
              <path class="cat-yarn-string" d="M292 215 Q320 235 335 211" fill="none" stroke="#E2703A" stroke-width="3" stroke-linecap="round"/>
            </g>

            <g class="story-paw-trail cat-paw-trail">
              <text x="236" y="165">🐾</text>
              <text x="264" y="142">🐾</text>
              <text x="292" y="167">🐾</text>
            </g>

            <g class="cat-sparkles">
              <text class="cat-sparkle sparkle-one" x="444" y="78">✦</text>
              <text class="cat-sparkle sparkle-two" x="474" y="114">✦</text>
              <text class="cat-sparkle sparkle-three" x="430" y="137">✦</text>
            </g>
          </svg>

          <div class="story-copy">
            <strong>Um cantinho tranquilo para ronronar ✨</strong>
            <span>Ambiente aconchegante, brincadeiras e espaço para descansar.</span>
          </div>
        </div>
      `,

      creche: `
        <div class="service-story service-story-daycare" aria-label="Animação de creche para pets">
          <svg class="story-svg" viewBox="0 0 760 250" role="img" aria-hidden="true">
            <defs>
              <linearGradient id="daycareSky" x1="0" x2="1">
                <stop offset="0%" stop-color="#DDF0EF"/>
                <stop offset="100%" stop-color="#FFF0C9"/>
              </linearGradient>
            </defs>

            <rect x="0" y="0" width="760" height="250" rx="24" fill="url(#daycareSky)"/>
            <path d="M0 190 Q130 168 260 190 T520 190 T760 190 V250 H0Z" fill="#A9CF91"/>

            <g class="daycare-sun">
              <circle cx="650" cy="52" r="27" fill="#F0B429"/>
              <g stroke="#F0B429" stroke-width="5" stroke-linecap="round">
                <line x1="650" y1="12" x2="650" y2="3"/>
                <line x1="650" y1="101" x2="650" y2="92"/>
                <line x1="610" y1="52" x2="600" y2="52"/>
                <line x1="700" y1="52" x2="690" y2="52"/>
                <line x1="621" y1="23" x2="614" y2="16"/>
                <line x1="679" y1="81" x2="686" y2="88"/>
              </g>
            </g>

            <g class="daycare-tree">
              <rect x="80" y="112" width="22" height="91" rx="9" fill="#845D3C"/>
              <circle cx="91" cy="94" r="48" fill="#5D9468"/>
              <circle cx="62" cy="105" r="31" fill="#6BA878"/>
              <circle cx="121" cy="108" r="34" fill="#6BA878"/>
            </g>

            <g class="daycare-sign">
              <rect x="282" y="56" width="196" height="58" rx="18" fill="#FFFDF7" stroke="#2C4A3B" stroke-width="4"/>
              <text x="380" y="91" text-anchor="middle" class="story-sign-text">CRECHE PET</text>
              <path d="M315 116 L305 150 M445 116 L455 150" stroke="#2C4A3B" stroke-width="5" stroke-linecap="round"/>
            </g>

            <g class="daycare-dog-character">
              <ellipse cx="203" cy="221" rx="39" ry="9" fill="#1E3329" opacity=".12"/>
              <g class="daycare-dog-runner">
                <ellipse cx="202" cy="188" rx="36" ry="28" fill="#E5B176" stroke="#2C4A3B" stroke-width="4"/>
                <circle cx="178" cy="168" r="25" fill="#E5B176" stroke="#2C4A3B" stroke-width="4"/>
                <ellipse cx="162" cy="150" rx="10" ry="20" fill="#8A5D38" transform="rotate(-30 162 150)"/>
                <circle cx="171" cy="166" r="3" fill="#1E3329"/>
                <circle cx="186" cy="166" r="3" fill="#1E3329"/>
                <circle cx="179" cy="175" r="5" fill="#1E3329"/>
                <path class="daycare-dog-tail" d="M233 180 Q260 158 262 184" fill="none" stroke="#8A5D38" stroke-width="10" stroke-linecap="round"/>
                <path d="M179 206 L164 226 M216 208 L232 225" stroke="#8A5D38" stroke-width="9" stroke-linecap="round"/>
              </g>
            </g>

            <g class="daycare-cat-character">
              <ellipse cx="534" cy="221" rx="34" ry="8" fill="#1E3329" opacity=".12"/>
              <g class="daycare-cat-jumper">
                <ellipse cx="536" cy="186" rx="31" ry="26" fill="#8FA7C5" stroke="#2C4A3B" stroke-width="4"/>
                <circle cx="537" cy="158" r="22" fill="#9DB5D1" stroke="#2C4A3B" stroke-width="4"/>
                <path d="M520 145 L524 124 L536 143Z" fill="#9DB5D1" stroke="#2C4A3B" stroke-width="3"/>
                <path d="M550 143 L558 124 L567 150Z" fill="#9DB5D1" stroke="#2C4A3B" stroke-width="3"/>
                <circle cx="530" cy="158" r="3" fill="#1E3329"/>
                <circle cx="544" cy="158" r="3" fill="#1E3329"/>
                <path d="M534 167 L540 167 L537 171Z" fill="#E2703A"/>
                <path class="daycare-cat-tail" d="M565 181 Q602 162 592 135" fill="none" stroke="#8FA7C5" stroke-width="10" stroke-linecap="round"/>
                <path d="M520 205 L507 222 M550 205 L565 221" stroke="#748EAD" stroke-width="8" stroke-linecap="round"/>
              </g>
            </g>

            <g class="daycare-ball">
              <circle cx="382" cy="198" r="19" fill="#F0B429" stroke="#2C4A3B" stroke-width="3"/>
              <path d="M365 193 Q382 184 399 193 M369 207 Q382 198 395 207" fill="none" stroke="#FFF7D6" stroke-width="4"/>
              <ellipse class="ball-shadow" cx="382" cy="225" rx="20" ry="5" fill="#1E3329" opacity=".15"/>
            </g>

            <g class="daycare-frisbee">
              <ellipse cx="458" cy="144" rx="27" ry="10" fill="#E2703A" stroke="#2C4A3B" stroke-width="3"/>
              <ellipse cx="458" cy="142" rx="16" ry="5" fill="#F6B08A"/>
            </g>

            <g class="story-paw-trail daycare-paws">
              <text x="255" y="217">🐾</text>
              <text x="288" y="192">🐾</text>
              <text x="323" y="216">🐾</text>
            </g>

            <g class="daycare-confetti">
              <circle class="confetti c1" cx="336" cy="128" r="5" fill="#E2703A"/>
              <circle class="confetti c2" cx="405" cy="127" r="5" fill="#F0B429"/>
              <circle class="confetti c3" cx="430" cy="168" r="5" fill="#5D9468"/>
              <path class="confetti c4" d="M355 148 l9 -9" stroke="#8FA7C5" stroke-width="5" stroke-linecap="round"/>
            </g>
          </svg>

          <div class="story-copy">
            <strong>Energia boa, brincadeira e amizade 🎾</strong>
            <span>Uma rotina divertida para gastar energia e socializar com segurança.</span>
          </div>
        </div>
      `,

      domiciliar: `
        <div class="service-story service-story-home" aria-label="Animação de atendimento domiciliar">
          <svg class="story-svg" viewBox="0 0 760 250" role="img" aria-hidden="true">
            <defs>
              <linearGradient id="homeSky" x1="0" x2="1">
                <stop offset="0%" stop-color="#E9F2EA"/>
                <stop offset="100%" stop-color="#FFF1D8"/>
              </linearGradient>
            </defs>

            <rect x="0" y="0" width="760" height="250" rx="24" fill="url(#homeSky)"/>
            <rect x="0" y="210" width="760" height="40" fill="#B8D3A5"/>

            <g class="home-house">
              <rect x="80" y="74" width="286" height="142" rx="8" fill="#FFF9EE" stroke="#2C4A3B" stroke-width="5"/>
              <path d="M56 84 L222 24 L390 84Z" fill="#E2703A" stroke="#2C4A3B" stroke-width="5" stroke-linejoin="round"/>
              <rect x="112" y="111" width="72" height="62" rx="8" fill="#D5E8ED" stroke="#2C4A3B" stroke-width="4"/>
              <path d="M148 111 V173 M112 142 H184" stroke="#2C4A3B" stroke-width="3"/>
              <rect x="270" y="106" width="68" height="110" rx="6" fill="#855A3D" stroke="#2C4A3B" stroke-width="4"/>
              <circle cx="323" cy="161" r="4" fill="#F0B429"/>
              <rect x="205" y="193" width="63" height="23" rx="4" fill="#C59260"/>
            </g>

            <g class="home-door-open">
              <path class="home-door-panel" d="M270 106 L234 118 L234 216 L270 216Z" fill="#A56C45" stroke="#2C4A3B" stroke-width="4"/>
              <circle cx="242" cy="164" r="3.5" fill="#F0B429"/>
            </g>

            <g class="home-tutor">
              <circle cx="287" cy="116" r="15" fill="#D8A57D"/>
              <path d="M271 116 Q287 93 303 116" fill="#5B3D2D"/>
              <rect x="272" y="130" width="31" height="49" rx="12" fill="#5D9468"/>
              <path class="home-tutor-arm" d="M299 140 Q321 126 327 112" fill="none" stroke="#D8A57D" stroke-width="9" stroke-linecap="round"/>
              <path d="M281 177 L276 206 M294 177 L300 206" stroke="#304D66" stroke-width="9" stroke-linecap="round"/>
            </g>

            <g class="home-caregiver">
              <ellipse cx="582" cy="222" rx="34" ry="7" fill="#1E3329" opacity=".12"/>
              <g class="home-caregiver-walk">
                <circle cx="584" cy="118" r="17" fill="#C98D68"/>
                <path d="M567 118 Q584 90 601 117 Q594 100 584 100 Q573 101 567 118Z" fill="#56392E"/>
                <rect x="566" y="134" width="37" height="54" rx="14" fill="#E2703A"/>
                <path class="caregiver-wave-arm" d="M598 143 Q619 126 622 108" fill="none" stroke="#C98D68" stroke-width="10" stroke-linecap="round"/>
                <path d="M570 184 L560 218 M595 184 L605 218" stroke="#35596B" stroke-width="10" stroke-linecap="round"/>
                <rect x="604" y="151" width="25" height="34" rx="6" fill="#2C4A3B"/>
                <path d="M610 151 Q616 140 623 151" fill="none" stroke="#2C4A3B" stroke-width="4"/>
                <circle cx="616" cy="165" r="4" fill="#F0B429"/>
              </g>
            </g>

            <g class="home-dog">
              <ellipse class="home-dog-shadow" cx="443" cy="226" rx="34" ry="7" fill="#1E3329" opacity=".13"/>
              <g class="home-dog-run">
                <ellipse cx="442" cy="198" rx="31" ry="23" fill="#E3B06D" stroke="#2C4A3B" stroke-width="4"/>
                <circle cx="464" cy="181" r="20" fill="#E3B06D" stroke="#2C4A3B" stroke-width="4"/>
                <ellipse cx="477" cy="166" rx="9" ry="16" fill="#855A3D" transform="rotate(28 477 166)"/>
                <circle cx="458" cy="180" r="3" fill="#1E3329"/>
                <circle cx="471" cy="181" r="3" fill="#1E3329"/>
                <circle cx="467" cy="188" r="4" fill="#1E3329"/>
                <path class="home-dog-tail" d="M412 192 Q385 174 388 197" fill="none" stroke="#855A3D" stroke-width="9" stroke-linecap="round"/>
                <path d="M427 215 L415 230 M452 217 L465 230" stroke="#855A3D" stroke-width="8" stroke-linecap="round"/>
              </g>
            </g>

            <g class="home-cat">
              <g class="home-cat-peek">
                <circle cx="172" cy="194" r="18" fill="#A8A4A2" stroke="#2C4A3B" stroke-width="3"/>
                <path d="M159 181 L161 164 L172 179Z" fill="#A8A4A2" stroke="#2C4A3B" stroke-width="2"/>
                <path d="M183 180 L190 164 L196 184Z" fill="#A8A4A2" stroke="#2C4A3B" stroke-width="2"/>
                <circle cx="167" cy="193" r="2.5" fill="#1E3329"/>
                <circle cx="178" cy="193" r="2.5" fill="#1E3329"/>
              </g>
            </g>

            <g class="story-paw-trail home-paws">
              <text x="493" y="206">🐾</text>
              <text x="519" y="183">🐾</text>
              <text x="544" y="207">🐾</text>
            </g>

            <g class="home-heart">
              <path d="M515 116 C506 102 486 108 489 125 C494 140 515 151 515 151 C515 151 536 140 541 125 C544 108 524 102 515 116Z" fill="#E2703A"/>
            </g>

            <g class="home-knock">
              <path d="M347 122 q18 -17 35 0 M352 132 q14 -12 27 0" fill="none" stroke="#F0B429" stroke-width="4" stroke-linecap="round"/>
            </g>
          </svg>

          <div class="story-copy">
            <strong>Cuidado que chega até a porta da sua casa 🏡</strong>
            <span>O pet recebe a visita com carinho enquanto o tutor acompanha tudo com tranquilidade.</span>
          </div>
        </div>
      `,
    };

    return scenes[service] || '';
  }

  function renderSelectedServiceAnimation() {
    if (!selectedServiceAnimation || !state.service) {
      if (selectedServiceAnimation) {
        selectedServiceAnimation.hidden = true;
      }

      return;
    }

    selectedServiceAnimation.innerHTML =
      serviceAnimationMarkup(state.service);

    selectedServiceAnimation.hidden = false;
    selectedServiceAnimation.dataset.service = state.service;
  }

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function maskPhone(value) {
    const number = digits(value).slice(0, 11);

    if (number.length <= 2) {
      return number;
    }

    if (number.length <= 6) {
      return `(${number.slice(0, 2)}) ${number.slice(2)}`;
    }

    if (number.length <= 10) {
      return (
        `(${number.slice(0, 2)}) ` +
        `${number.slice(2, 6)}-${number.slice(6)}`
      );
    }

    return (
      `(${number.slice(0, 2)}) ` +
      `${number.slice(2, 7)}-${number.slice(7)}`
    );
  }

  async function api(path, options = {}) {
    let response;

    try {
      response = await fetch(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
    } catch (_) {
      throw new Error(
        'Não foi possível acessar o servidor. Abra o projeto pelo iniciar.bat ou execute npm start; não abra o HTML diretamente.'
      );
    }

    let body;

    try {
      body = await response.json();
    } catch (_) {
      body = {
        error: 'O servidor retornou uma resposta inválida.',
      };
    }

    if (!response.ok || body.ok === false) {
      const message =
        response.status === 404 &&
        path.startsWith('/api/')
          ? 'A API desta página não foi encontrada. Reinicie usando os arquivos desta versão do projeto.'
          : body.error ||
            'Não foi possível concluir a solicitação.';

      const error = new Error(message);

      error.status = response.status;
      error.code = body.code;
      error.details = body.details;

      throw error;
    }

    return body;
  }

  async function loadConfig() {
    try {
      const result = await api('/api/configuracoes');

      config = {
        ...DEFAULT_CONFIG,
        ...result.configuracoes,
        precos: {
          ...DEFAULT_CONFIG.precos,
          ...(result.configuracoes.precos || {}),
          creche: {
            ...DEFAULT_CONFIG.precos.creche,
            ...(result.configuracoes.precos?.creche || {}),
          },
          domiciliar: {
            ...DEFAULT_CONFIG.precos.domiciliar,
            ...(result.configuracoes.precos?.domiciliar || {}),
          },
        },
      };

      serverReady = true;

      document.getElementById('fileHelp').textContent =
        `Tamanho máximo: ${config.maxComprovanteMB} MB.`;

      document.getElementById('pixKeyText').textContent =
        `Chave Pix: ${config.pixKey}`;
    } catch (error) {
      serverReady = false;
      showError(error.message);
      btnNext.disabled = true;
    }
  }

  function showError(message) {
    errorEl.textContent = message || '';
  }

  function clearHumanNotice() {
    humanCareNotice.hidden = true;
    humanCareNotice.innerHTML = '';
  }

  function showHumanNotice(message, url) {
    humanCareNotice.hidden = false;

    humanCareNotice.innerHTML = `
      <strong>Atendimento direto com a equipe</strong>

      <p>${escapeHTML(message)}</p>

      <a
        class="btn btn-whatsapp"
        href="${escapeHTML(url)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Falar pelo WhatsApp
      </a>
    `;
  }

  function setLoading(isLoading, label) {
    btnNext.disabled =
      isLoading ||
      !serverReady;

    btnBack.disabled = isLoading;

    btnNext.classList.toggle(
      'is-loading',
      isLoading
    );

    if (isLoading) {
      btnNext.dataset.originalText =
        btnNext.textContent;

      btnNext.textContent =
        label ||
        'Processando…';
    } else {
      delete btnNext.dataset.originalText;
      updateNavigation();
    }
  }

  function renderPawProgress() {
    pawProgress.innerHTML = '';

    pawProgress.setAttribute(
      'aria-valuenow',
      String(state.stepIndex + 1)
    );

    STEPS.forEach((_, index) => {
      const dot =
        document.createElement('span');

      dot.className =
        'paw-dot' +
        (
          index === state.stepIndex
            ? ' active'
            : index < state.stepIndex
              ? ' done'
              : ''
        );

      dot.textContent = '🐾';

      dot.setAttribute(
        'aria-hidden',
        'true'
      );

      pawProgress.appendChild(dot);

      if (index < STEPS.length - 1) {
        const track =
          document.createElement('span');

        track.className = 'paw-track';

        const fill =
          document.createElement('span');

        fill.style.width =
          index < state.stepIndex
            ? '100%'
            : '0%';

        track.appendChild(fill);
        pawProgress.appendChild(track);
      }
    });
  }

  function updateNavigation() {
    const step =
      STEPS[state.stepIndex];

    wizardNav.style.display =
      step === 'success'
        ? 'none'
        : 'flex';

    btnBack.style.visibility =
      state.stepIndex === 0
        ? 'hidden'
        : 'visible';

    const labels = {
      pets: 'Verificar vagas →',
      review: 'Ir para o Pix →',
      payment:
        'Enviar comprovante e gerar protocolo →',
    };

    btnNext.textContent =
      labels[step] ||
      'Continuar →';

    btnNext.disabled =
      !serverReady;
  }

  function goToStep(
    index,
    { scroll = true } = {}
  ) {
    state.stepIndex =
      Math.max(
        0,
        Math.min(
          index,
          STEPS.length - 1
        )
      );

    const stepName =
      STEPS[state.stepIndex];

    document
      .querySelectorAll('.step')
      .forEach((element) => {
        element.classList.toggle(
          'active',
          element.dataset.step ===
            stepName
        );
      });

    showError('');
    clearHumanNotice();
    renderPawProgress();
    updateNavigation();

    if (stepName === 'details') {
      renderDetailsStep();
    }

    if (stepName === 'pets') {
      renderPetsStep();
    }

    if (stepName === 'review') {
      renderReview();
    }

    if (stepName === 'payment') {
      renderPayment();
    }

    if (stepName === 'success') {
      renderSuccess();
    }

    if (scroll) {
      document
        .querySelector('.wizard-card')
        .scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
    }
  }

  function selectService(service) {
    if (!SERVICE_LABELS[service]) {
      return;
    }

    if (
      state.service &&
      state.service !== service
    ) {
      state.details = {};
      state.pets = [];
      state.observacao = '';
      state.preview = null;
      state.comprovante = null;
      state.result = null;
    }

    state.service = service;

    const radio =
      form.querySelector(
        `input[name="service"][value="${service}"]`
      );

    if (radio) {
      radio.checked = true;
    }

    document
      .querySelectorAll('.service-card')
      .forEach((card) => {
        card.classList.toggle(
          'is-selected',
          card.dataset.service ===
            service
        );
      });

    document
      .querySelectorAll('.choice-card')
      .forEach((card) => {
        const input =
          card.querySelector(
            'input[name="service"]'
          );

        card.classList.toggle(
          'is-selected',
          input?.value === service
        );
      });

    renderSelectedServiceAnimation();
  }

  function validateService() {
    const selected =
      form.querySelector(
        'input[name="service"]:checked'
      );

    if (!selected) {
      return 'Escolha um serviço para continuar.';
    }

    selectService(selected.value);

    return null;
  }

  function validateTutor() {
    const nome =
      document
        .getElementById('nomeTutor')
        .value
        .trim()
        .replace(/\s+/g, ' ');

    const phone =
      digits(
        document
          .getElementById('telefoneTutor')
          .value
      );

    if (
      nome
        .split(' ')
        .filter(Boolean)
        .length < 2
    ) {
      return 'Informe o nome completo do tutor.';
    }

    if (
      phone.length < 10 ||
      phone.length > 11
    ) {
      return 'Informe um telefone válido com DDD.';
    }

    state.nomeTutor = nome;
    state.telefoneTutor = phone;

    return null;
  }

  function renderDetailsStep() {
    const title =
      document.getElementById(
        'detailsTitle'
      );

    const hint =
      document.getElementById(
        'detailsHint'
      );

    const container =
      document.getElementById(
        'detailsFields'
      );

    title.textContent =
      `Detalhes — ${SERVICE_LABELS[state.service]}`;

    if (
  state.service ===
    'hospedagem_cao' ||
  state.service ===
    'hospedagem_gato'
) {
  hint.textContent =
    'A quantidade de diárias é calculada automaticamente considerando a data e o horário de entrada e a data e o horário de checkout.';

  container.innerHTML = `
    <div class="field-grid">
      <div class="field">
        <label for="dataEntrada">
          Data de entrada
        </label>

        <input
          type="date"
          id="dataEntrada"
          min="${config.hoje}"
          value="${escapeHTML(
            state.details.dataEntrada ||
              ''
          )}"
        >
      </div>

      <div class="field">
        <label for="horaEntrada">
          Horário de entrada
        </label>

        <input
          type="time"
          id="horaEntrada"
          value="${escapeHTML(
            state.details.horaEntrada ||
              ''
          )}"
        >
      </div>
    </div>

    <div class="field-grid">
      <div class="field">
        <label for="diarias">
          Quantidade de diárias
        </label>

        <input
          type="number"
          id="diarias"
          min="1"
          max="${config.maxDiasHospedagem}"
          value="${escapeHTML(
            state.details.diarias ||
              ''
          )}"
          readonly
        >
      </div>

      <div class="field">
        <label for="dataSaida">
          Data de checkout
        </label>

        <input
          type="date"
          id="dataSaida"
          min="${config.hoje}"
          value="${escapeHTML(
            state.details.dataSaida ||
              ''
          )}"
        >
      </div>
    </div>

    <div class="field-grid">
      <div class="field">
        <label for="horaSaida">
          Horário de retirada
        </label>

        <input
          type="time"
          id="horaSaida"
          value="${escapeHTML(
            state.details.horaSaida ||
              ''
          )}"
        >
      </div>

      <div class="field">
        <label for="quantidadePets">
          Quantidade de pets
        </label>

        <input
          type="number"
          id="quantidadePets"
          min="1"
          max="${config.maxPets}"
          value="${escapeHTML(
            state.details.quantidadePets ||
              1
          )}"
        >
      </div>
    </div>

    <div
      class="notice notice-warning"
      id="checkoutPolicyNotice"
      hidden
    >
      <strong>
        ⚠️ Atenção ao horário de checkout
      </strong>

      <p id="checkoutPolicyText"></p>
    </div>

    <p
      class="inline-calculation"
      id="hotelCalculation"
    ></p>
  `;

  const update = () => {
    const dataEntrada =
      document
        .getElementById(
          'dataEntrada'
        )
        .value;

    const horaEntrada =
      document
        .getElementById(
          'horaEntrada'
        )
        .value;

    const dataSaida =
      document
        .getElementById(
          'dataSaida'
        )
        .value;

    const horaSaida =
      document
        .getElementById(
          'horaSaida'
        )
        .value;

    const days =
      calculateHotelNights(
        dataEntrada,
        horaEntrada,
        dataSaida,
        horaSaida
      );

    const pets =
      Number(
        document
          .getElementById(
            'quantidadePets'
          )
          .value || 0
      );

    document
      .getElementById(
        'diarias'
      )
      .value =
      days > 0
        ? days
        : '';

    const base =
      days *
      pets *
      config.precos.hospedagem;

    document
      .getElementById(
        'hotelCalculation'
      )
      .textContent =
      days > 0 &&
      pets > 0
        ? (
            `Valor previsto da hospedagem: ` +
            `${formatCurrency(base)} ` +
            `(${days} diária(s) × ` +
            `${pets} pet(s) × ` +
            `${formatCurrency(
              config.precos.hospedagem
            )}).`
          )
        : '';

    const policyNotice =
      document.getElementById(
        'checkoutPolicyNotice'
      );

    const policyText =
      document.getElementById(
        'checkoutPolicyText'
      );

    if (
      dataEntrada &&
      horaEntrada &&
      dataSaida &&
      horaSaida &&
      days > 0
    ) {
      policyNotice.hidden =
        false;

      policyText.textContent =
        `Período calculado automaticamente: ` +
        `${days} diária(s). ` +
        `A quantidade considera o tempo entre ` +
        `a entrada e o checkout, contando uma ` +
        `nova diária a cada período iniciado de 24 horas.`;
    } else {
      policyNotice.hidden =
        true;

      policyText.textContent =
        '';
    }
  };

  [
    'dataEntrada',
    'horaEntrada',
    'dataSaida',
    'horaSaida',
    'quantidadePets',
  ].forEach((id) => {
    document
      .getElementById(id)
      .addEventListener(
        'input',
        update
      );
  });

  update();

  return;
}

    if (
      state.service ===
      'creche'
    ) {
      hint.textContent =
        'Escolha um período de até 31 dias e os dias exatos da semana.';

      const frequencia =
        Number(
          state.details.frequencia ||
            1
        );

      container.innerHTML = `
        <div class="field-grid">
          <div class="field">
            <label for="dataInicio">
              Data inicial
            </label>

            <input
              type="date"
              id="dataInicio"
              min="${config.hoje}"
              value="${escapeHTML(
                state.details.dataInicio ||
                  ''
              )}"
            >
          </div>

          <div class="field">
            <label for="dataFim">
              Data final
            </label>

            <input
              type="date"
              id="dataFim"
              min="${config.hoje}"
              value="${escapeHTML(
                state.details.dataFim ||
                  ''
              )}"
            >
          </div>
        </div>

        <div class="field">
          <label for="frequencia">
            Frequência semanal
          </label>

          <select id="frequencia">
            ${
              [1, 2, 3, 4, 5]
                .map(
                  (value) =>
                    `<option value="${value}" ${
                      value === frequencia
                        ? 'selected'
                        : ''
                    }>` +
                    `${value}x por semana — ${formatCurrency(
                      config.precos
                        .creche[value]
                    )}/mês` +
                    `</option>`
                )
                .join('')
            }
          </select>
        </div>

        <div class="field">
          <label>Dias da semana</label>

          <div
            class="weekday-grid"
            id="weekdayGrid"
          >
            ${
              Object.entries(
                WEEKDAY_LABELS
              )
                .map(
                  ([value, label]) => {
                    const checked =
                      (
                        state.details
                          .diasSemana ||
                        []
                      ).includes(
                        Number(value)
                      );

                    return `
                      <label
                        class="weekday-chip"
                      >
                        <input
                          type="checkbox"
                          value="${value}"
                          ${
                            checked
                              ? 'checked'
                              : ''
                          }
                        >

                        <span>
                          ${escapeHTML(
                            label.replace(
                              '-feira',
                              ''
                            )
                          )}
                        </span>
                      </label>
                    `;
                  }
                )
                .join('')
            }
          </div>

          <small
            class="field-help"
            id="weekdayHelp"
          ></small>
        </div>

        <p
          class="inline-calculation"
          id="periodCalculation"
        ></p>
      `;

      const updateWeekdays =
        () => {
          const selectedFrequency =
            Number(
              document
                .getElementById(
                  'frequencia'
                )
                .value
            );

          const checks = [
            ...document.querySelectorAll(
              '#weekdayGrid input'
            ),
          ];

          if (
            selectedFrequency === 5
          ) {
            checks.forEach(
              (check) => {
                check.checked = true;
                check.disabled = true;
              }
            );

            document
              .getElementById(
                'weekdayHelp'
              )
              .textContent =
              'No plano de 5x, segunda a sexta são selecionadas automaticamente.';
          } else {
            checks.forEach(
              (check) => {
                check.disabled = false;
              }
            );

            document
              .getElementById(
                'weekdayHelp'
              )
              .textContent =
              `Escolha exatamente ${selectedFrequency} dia(s).`;
          }
        };

      const updatePeriod = () => {
        const start =
          document
            .getElementById(
              'dataInicio'
            )
            .value;

        const end =
          document
            .getElementById(
              'dataFim'
            )
            .value;

        const days =
          inclusiveDays(
            start,
            end
          );

        document
          .getElementById(
            'periodCalculation'
          )
          .textContent =
          days > 0
            ? `Período informado: ${days} dia(s).`
            : '';
      };

      document
        .getElementById(
          'frequencia'
        )
        .addEventListener(
          'change',
          updateWeekdays
        );

      document
        .getElementById(
          'dataInicio'
        )
        .addEventListener(
          'input',
          updatePeriod
        );

      document
        .getElementById(
          'dataFim'
        )
        .addEventListener(
          'input',
          updatePeriod
        );

      updateWeekdays();
      updatePeriod();

      return;
    }

    hint.textContent =
      'Informe a data inicial e a data final. O valor considera todos os dias do período.';

    const visitas =
      Number(
        state.details.visitasDia ||
          1
      );

    container.innerHTML = `
      <div class="field-grid">
        <div class="field">
          <label for="dataInicio">
            Data inicial
          </label>

          <input
            type="date"
            id="dataInicio"
            min="${config.hoje}"
            value="${escapeHTML(
              state.details.dataInicio ||
                ''
            )}"
          >
        </div>

        <div class="field">
          <label for="dataFim">
            Data final
          </label>

          <input
            type="date"
            id="dataFim"
            min="${config.hoje}"
            value="${escapeHTML(
              state.details.dataFim ||
                ''
            )}"
          >
        </div>
      </div>

      <div class="field">
        <label>
          Visitas por dia
        </label>

        <div
          class="btn-toggle-row"
          id="visitasToggle"
        >
          <button
            type="button"
            class="btn-toggle ${
              visitas === 1
                ? 'selected'
                : ''
            }"
            data-value="1"
          >
            1 visita — ${formatCurrency(
              config.precos
                .domiciliar[1]
            )}/dia
          </button>

          <button
            type="button"
            class="btn-toggle ${
              visitas === 2
                ? 'selected'
                : ''
            }"
            data-value="2"
          >
            2 visitas — ${formatCurrency(
              config.precos
                .domiciliar[2]
            )}/dia
          </button>
        </div>
      </div>

      <div class="field">
        <label for="endereco">
          Endereço completo
        </label>

        <input
          type="text"
          id="endereco"
          maxlength="300"
          placeholder="Rua, número, bairro e complemento"
          value="${escapeHTML(
            state.details.endereco ||
              ''
          )}"
        >
      </div>

      <div class="field">
        <label for="quantidadePets">
          Quantidade de pets
        </label>

        <input
          type="number"
          id="quantidadePets"
          min="1"
          max="${config.maxPets}"
          value="${escapeHTML(
            state.details.quantidadePets ||
              1
          )}"
        >
      </div>

      <p
        class="inline-calculation"
        id="homeCalculation"
      ></p>
    `;

    const toggleRow =
      document.getElementById(
        'visitasToggle'
      );

    toggleRow
      .querySelectorAll(
        '.btn-toggle'
      )
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            toggleRow
              .querySelectorAll(
                '.btn-toggle'
              )
              .forEach((item) =>
                item.classList.remove(
                  'selected'
                )
              );

            button.classList.add(
              'selected'
            );

            state.details.visitasDia =
              Number(
                button.dataset.value
              );

            updateHomeCalculation();
          }
        );
      });

    const updateHomeCalculation =
      () => {
        const start =
          document
            .getElementById(
              'dataInicio'
            )
            .value;

        const end =
          document
            .getElementById(
              'dataFim'
            )
            .value;

        const days =
          inclusiveDays(
            start,
            end
          );

        const selected =
          toggleRow.querySelector(
            '.btn-toggle.selected'
          );

        const daily =
          selected
            ? config.precos
                .domiciliar[
                  Number(
                    selected.dataset
                      .value
                  )
                ]
            : 0;

        document
          .getElementById(
            'homeCalculation'
          )
          .textContent =
          days > 0 &&
          daily
            ? `${days} dia(s) — estimativa de ${formatCurrency(
                days * daily
              )}.`
            : '';
      };

    document
      .getElementById(
        'dataInicio'
      )
      .addEventListener(
        'input',
        updateHomeCalculation
      );

    document
      .getElementById(
        'dataFim'
      )
      .addEventListener(
        'input',
        updateHomeCalculation
      );

    updateHomeCalculation();
  }

  function validateDateRange(
    start,
    end,
    maxDays,
    label
  ) {
    if (!start) {
      return 'Informe a data inicial.';
    }

    if (!end) {
      return 'Informe a data final.';
    }

    if (
      start < config.hoje ||
      end < config.hoje
    ) {
      return 'As datas não podem ser anteriores a hoje.';
    }

    if (end < start) {
      return 'A data final não pode ser anterior à data inicial.';
    }

    const days =
      inclusiveDays(
        start,
        end
      );

    if (days > maxDays) {
      return (
        `O período de ${label} pode ter no máximo ` +
        `${maxDays} dias.`
      );
    }

    return null;
  }

  function syncPetsArrayLength(
    count
  ) {
    while (
      state.pets.length <
      count
    ) {
      state.pets.push({});
    }

    state.pets.length =
      count;
  }

  function validateDetails() {
    state.preview = null;
    state.comprovante = null;

    if (
  state.service ===
    'hospedagem_cao' ||
  state.service ===
    'hospedagem_gato'
) {
  const dataEntrada =
    document
      .getElementById(
        'dataEntrada'
      )
      .value;

  const horaEntrada =
    document
      .getElementById(
        'horaEntrada'
      )
      .value;

  const dataSaida =
    document
      .getElementById(
        'dataSaida'
      )
      .value;

  const horaSaida =
    document
      .getElementById(
        'horaSaida'
      )
      .value;

  const diarias =
    calculateHotelNights(
      dataEntrada,
      horaEntrada,
      dataSaida,
      horaSaida
    );

  const quantidadePets =
    Number(
      document
        .getElementById(
          'quantidadePets'
        )
        .value
    );

  if (!dataEntrada) {
    return 'Informe a data de entrada.';
  }

  if (
    dataEntrada <
    config.hoje
  ) {
    return 'A data de entrada não pode ser anterior a hoje.';
  }

  if (!horaEntrada) {
    return 'Informe o horário de entrada.';
  }

  if (!dataSaida) {
    return 'Informe a data de checkout.';
  }

  if (dataSaida < dataEntrada) {
    return 'A data de checkout não pode ser anterior à data de entrada.';
  }

  if (!horaSaida) {
    return 'Informe o horário de retirada.';
  }

  if (diarias < 1) {
    return 'Não foi possível calcular a quantidade de diárias. Verifique as datas e horários.';
  }

  if (
    !Number.isInteger(diarias) ||
    diarias >
      config.maxDiasHospedagem
  ) {
    return (
      `O período pode ter no máximo ` +
      `${config.maxDiasHospedagem} diárias.`
    );
  }

  if (
    !Number.isInteger(
      quantidadePets
    ) ||
    quantidadePets < 1 ||
    quantidadePets >
      config.maxPets
  ) {
    return (
      `Informe de 1 a ` +
      `${config.maxPets} pets.`
    );
  }

  state.details = {
    dataEntrada,
    horaEntrada,
    dataSaida,
    horaSaida,
    diarias,
    quantidadePets,
  };

  syncPetsArrayLength(
    quantidadePets
  );

  return null;
}
    


    if (
      state.service ===
      'creche'
    ) {
      const dataInicio =
        document
          .getElementById(
            'dataInicio'
          )
          .value;

      const dataFim =
        document
          .getElementById(
            'dataFim'
          )
          .value;

      const rangeError =
        validateDateRange(
          dataInicio,
          dataFim,
          config.maxDiasCreche,
          'creche'
        );

      if (rangeError) {
        return rangeError;
      }

      const frequencia =
        Number(
          document
            .getElementById(
              'frequencia'
            )
            .value
        );

      const diasSemana = [
        ...document.querySelectorAll(
          '#weekdayGrid input:checked'
        ),
      ]
        .map((input) =>
          Number(input.value)
        )
        .sort(
          (a, b) => a - b
        );

      if (
        diasSemana.length !==
        frequencia
      ) {
        return (
          `Escolha exatamente ` +
          `${frequencia} dia(s) da semana.`
        );
      }

      state.details = {
        dataInicio,
        dataFim,
        frequencia,
        diasSemana,
      };

      syncPetsArrayLength(1);

      return null;
    }

    const dataInicio =
      document
        .getElementById(
          'dataInicio'
        )
        .value;

    const dataFim =
      document
        .getElementById(
          'dataFim'
        )
        .value;

    const rangeError =
      validateDateRange(
        dataInicio,
        dataFim,
        config.maxDiasDomiciliar,
        'atendimento domiciliar'
      );

    if (rangeError) {
      return rangeError;
    }

    const selectedVisit =
      document.querySelector(
        '#visitasToggle .btn-toggle.selected'
      );

    const visitasDia =
      selectedVisit
        ? Number(
            selectedVisit
              .dataset.value
          )
        : 0;

    const quantidadePets =
      Number(
        document
          .getElementById(
            'quantidadePets'
          )
          .value
      );

    const endereco =
      document
        .getElementById(
          'endereco'
        )
        .value
        .trim();

    if (
      ![1, 2].includes(
        visitasDia
      )
    ) {
      return 'Escolha 1 ou 2 visitas por dia.';
    }

    if (
      endereco.length < 8
    ) {
      return 'Informe um endereço mais completo.';
    }

    if (
      !Number.isInteger(
        quantidadePets
      ) ||
      quantidadePets < 1 ||
      quantidadePets >
        config.maxPets
    ) {
      return (
        `Informe de 1 a ` +
        `${config.maxPets} pets.`
      );
    }

    state.details = {
      dataInicio,
      dataFim,
      visitasDia,
      endereco,
      quantidadePets,
    };

    syncPetsArrayLength(
      quantidadePets
    );

    return null;
  }

  function renderPetsStep() {
    const container =
      document.getElementById(
        'petsFields'
      );

    container.innerHTML = '';

    document
      .getElementById(
        'observacao'
      )
      .value =
      state.observacao ||
      '';

    state.pets.forEach(
      (pet, index) => {
        const card =
          document.createElement(
            'div'
          );

        card.className =
          'pet-card';

        if (
          state.service ===
          'hospedagem_cao'
        ) {
          card.innerHTML = `
            <div class="pet-card-title">
              🐾 Pet ${index + 1}
            </div>

            <div class="field-grid">
              <div class="field">
                <label for="petNome${index}">
                  Nome do pet
                </label>

                <input
                  type="text"
                  id="petNome${index}"
                  maxlength="60"
                  value="${escapeHTML(
                    pet.nome || ''
                  )}"
                >
              </div>

              <div class="field">
                <label for="petRaca${index}">
                  Raça
                </label>

                <input
                  type="text"
                  id="petRaca${index}"
                  maxlength="80"
                  value="${escapeHTML(
                    pet.raca || ''
                  )}"
                >
              </div>
            </div>

            <div class="field">
              <label>Porte</label>

              <div
                class="btn-toggle-row"
                id="porteToggle${index}"
              >
                <button
                  type="button"
                  class="btn-toggle ${
                    pet.porte ===
                    'pequeno'
                      ? 'selected'
                      : ''
                  }"
                  data-value="pequeno"
                >
                  Pequeno
                </button>

                <button
                  type="button"
                  class="btn-toggle ${
                    pet.porte ===
                    'medio'
                      ? 'selected'
                      : ''
                  }"
                  data-value="medio"
                >
                  Médio
                </button>
              </div>
            </div>

            <div class="field">
              <label for="petConvive${index}">
                Convive bem com outros cães?
              </label>

              <input
                type="text"
                id="petConvive${index}"
                maxlength="250"
                placeholder="Sim, não ou descreva"
                value="${escapeHTML(
                  pet.convive || ''
                )}"
              >
            </div>

            <div class="field">
              <label for="petCastrado${index}">
                É castrado? Qual a idade?
              </label>

              <input
                type="text"
                id="petCastrado${index}"
                maxlength="120"
                placeholder="Ex.: Sim, 3 anos"
                value="${escapeHTML(
                  pet.castradoIdade ||
                    ''
                )}"
              >
            </div>

            <div class="field">
              <label for="petCuidados${index}">
                Alergia, deficiência ou cuidado especial
              </label>

              <textarea
                id="petCuidados${index}"
                maxlength="500"
                placeholder="Se não tiver, digite Não"
              >${escapeHTML(
                pet.cuidados ||
                  ''
              )}</textarea>
            </div>
          `;
        } else if (
          state.service ===
          'hospedagem_gato'
        ) {
          card.innerHTML = `
            <div class="pet-card-title">
              🐾 Gato ${index + 1}
            </div>

            <div class="field-grid">
              <div class="field">
                <label for="petNome${index}">
                  Nome do gato
                </label>

                <input
                  type="text"
                  id="petNome${index}"
                  maxlength="60"
                  value="${escapeHTML(
                    pet.nome || ''
                  )}"
                >
              </div>

              <div class="field">
                <label for="petRaca${index}">
                  Raça
                  <small>(opcional)</small>
                </label>

                <input
                  type="text"
                  id="petRaca${index}"
                  maxlength="80"
                  value="${escapeHTML(
                    pet.raca || ''
                  )}"
                >
              </div>
            </div>

            <div class="field">
              <label for="petCastrado${index}">
                É castrado? Qual a idade?
              </label>

              <input
                type="text"
                id="petCastrado${index}"
                maxlength="120"
                placeholder="Ex.: Sim, 3 anos"
                value="${escapeHTML(
                  pet.castradoIdade ||
                    ''
                )}"
              >
            </div>

            <div class="field">
              <label for="petCuidados${index}">
                Alergia, deficiência ou cuidado especial
              </label>

              <textarea
                id="petCuidados${index}"
                maxlength="500"
                placeholder="Se não tiver, digite Não"
              >${escapeHTML(
                pet.cuidados ||
                  ''
              )}</textarea>
            </div>
          `;
        } else {
          card.innerHTML = `
            <div class="pet-card-title">
              🐾 Pet ${index + 1}
            </div>

            <div class="field-grid">
              <div class="field">
                <label for="petNome${index}">
                  Nome do pet
                </label>

                <input
                  type="text"
                  id="petNome${index}"
                  maxlength="60"
                  value="${escapeHTML(
                    pet.nome || ''
                  )}"
                >
              </div>

              <div class="field">
                <label for="petRaca${index}">
                  Raça
                </label>

                <input
                  type="text"
                  id="petRaca${index}"
                  maxlength="80"
                  value="${escapeHTML(
                    pet.raca || ''
                  )}"
                >
              </div>
            </div>

            <div class="field">
              <label for="petCuidados${index}">
                Alergia, deficiência ou cuidado especial
              </label>

              <textarea
                id="petCuidados${index}"
                maxlength="500"
                placeholder="Se não tiver, digite Não"
              >${escapeHTML(
                pet.cuidados ||
                  ''
              )}</textarea>
            </div>
          `;
        }

        container.appendChild(
          card
        );

        const toggle =
          card.querySelector(
            `#porteToggle${index}`
          );

        if (toggle) {
          toggle
            .querySelectorAll(
              '.btn-toggle'
            )
            .forEach(
              (button) => {
                button.addEventListener(
                  'click',
                  () => {
                    toggle
                      .querySelectorAll(
                        '.btn-toggle'
                      )
                      .forEach(
                        (item) =>
                          item.classList.remove(
                            'selected'
                          )
                      );

                    button.classList.add(
                      'selected'
                    );

                    state.pets[
                      index
                    ].porte =
                      button.dataset.value;

                    clearHumanNotice();
                  }
                );
              }
            );
        }
      }
    );
  }

  function validatePets() {
    clearHumanNotice();

    for (
      let index = 0;
      index < state.pets.length;
      index += 1
    ) {
      const nome =
        document
          .getElementById(
            `petNome${index}`
          )
          .value
          .trim();

      const racaElement =
        document.getElementById(
          `petRaca${index}`
        );

      const raca =
        racaElement
          ? racaElement.value.trim()
          : '';

      const cuidados =
        document
          .getElementById(
            `petCuidados${index}`
          )
          .value
          .trim();

      if (!nome) {
        return (
          `Informe o nome do pet ` +
          `${index + 1}.`
        );
      }

      if (
        state.service !==
          'hospedagem_gato' &&
        !raca
      ) {
        return (
          `Informe a raça do pet ` +
          `${index + 1}.`
        );
      }

      if (!cuidados) {
        return (
          `Informe os cuidados do pet ` +
          `${index + 1}; se não houver, digite Não.`
        );
      }

      const pet = {
        nome,
        raca,
        cuidados,
      };

      if (
        state.service ===
        'hospedagem_cao'
      ) {
        const selected =
          document.querySelector(
            `#porteToggle${index} .btn-toggle.selected`
          );

        if (!selected) {
          return (
            `Escolha o porte do pet ` +
            `${index + 1}.`
          );
        }

        pet.porte =
          selected.dataset.value;

        pet.convive =
          document
            .getElementById(
              `petConvive${index}`
            )
            .value
            .trim();

        pet.castradoIdade =
          document
            .getElementById(
              `petCastrado${index}`
            )
            .value
            .trim();

        if (!pet.convive) {
          return (
            `Informe como é a convivência do pet ` +
            `${index + 1}.`
          );
        }

        if (
          !pet.castradoIdade
        ) {
          return (
            `Informe se o pet ${index + 1} ` +
            `é castrado e a idade.`
          );
        }
      }

      if (
        state.service ===
        'hospedagem_gato'
      ) {
        pet.castradoIdade =
          document
            .getElementById(
              `petCastrado${index}`
            )
            .value
            .trim();

        if (
          !pet.castradoIdade
        ) {
          return (
            `Informe se o gato ${index + 1} ` +
            `é castrado e a idade.`
          );
        }
      }

      state.pets[index] =
        pet;
    }

    state.observacao =
      document
        .getElementById(
          'observacao'
        )
        .value
        .trim();

    return null;
  }

  function buildPayload() {
    return {
      servico: state.service,
      nomeTutor: state.nomeTutor,
      telefoneTutor:
        state.telefoneTutor,
      detalhes: {
        ...state.details,
      },
      pets: state.pets.map(
        (pet) => ({
          ...pet,
        })
      ),
      observacao:
        state.observacao,
    };
  }

  async function checkAvailability() {
    setLoading(
      true,
      'Verificando vagas…'
    );

    try {
      const result =
        await api(
          '/api/disponibilidade',
          {
            method: 'POST',
            body: JSON.stringify(
              buildPayload()
            ),
          }
        );

      state.preview =
        result.resumo;

      return null;
    } catch (error) {
      return error.message;
    } finally {
      setLoading(false);
    }
  }

  function row(label, value) {
    return `
      <div class="review-row">
        <span>
          ${escapeHTML(label)}
        </span>

        <strong>
          ${escapeHTML(
            value == null ||
            value === ''
              ? '—'
              : value
          )}
        </strong>
      </div>
    `;
  }

  function renderReview() {
    if (!state.preview) {
      return;
    }

    const preview =
      state.preview;

    const petRows =
      preview.pets
        .map(
          (pet, index) => {
            const parts = [
              pet.nome,
            ];

            if (pet.raca) {
              parts.push(
                pet.raca
              );
            }

            if (pet.porte) {
              parts.push(
                `porte ${pet.porte}`
              );
            }

            return row(
              `Pet ${index + 1}`,
              parts.join(' · ')
            );
          }
        )
        .join('');

    let serviceRows = '';

    if (
      state.service ===
        'hospedagem_cao' ||
      state.service ===
        'hospedagem_gato'
    ) {
      serviceRows += row(
        'Entrada',
        `${formatDate(
          preview.entrada
        )} às ${preview.horaEntrada}`
      );

      serviceRows += row(
        'Checkout',
        `${formatDate(
          preview.saida
        )} às ${preview.horaSaida}`
      );

      serviceRows += row(
        'Diárias',
        preview.quantidadeDias
      );
    } else if (
      state.service ===
      'creche'
    ) {
      serviceRows += row(
        'Período',
        `${formatDate(
          preview.entrada
        )} até ${formatDate(
          preview.saida
        )}`
      );

      serviceRows += row(
        'Frequência',
        `${preview.frequenciaSemanal}x por semana`
      );

      serviceRows += row(
        'Dias',
        preview.diasSemanaLabels.join(
          ', '
        )
      );
    } else {
      serviceRows += row(
        'Período',
        `${formatDate(
          preview.entrada
        )} até ${formatDate(
          preview.saida
        )}`
      );

      serviceRows += row(
        'Quantidade de dias',
        preview.quantidadeDias
      );

      serviceRows += row(
        'Visitas por dia',
        preview.visitasDia
      );

      serviceRows += row(
        'Endereço',
        preview.endereco
      );
    }

    document
      .getElementById(
        'reviewBox'
      )
      .innerHTML = `
        <section class="review-section">
          <h4>
            Tutor e serviço
          </h4>

          ${row(
            'Tutor',
            preview.nomeTutor
          )}

          ${row(
            'Telefone',
            maskPhone(
              preview.telefone
            )
          )}

          ${row(
            'Serviço',
            preview.servicoLabel
          )}
        </section>

        <section class="review-section">
          <h4>
            Datas e detalhes
          </h4>

          ${serviceRows}

          ${row(
            'Quantidade de pets',
            preview.quantidadePets
          )}
        </section>

        <section class="review-section">
          <h4>
            Pets
          </h4>

          ${petRows}

          ${row(
            'Observações',
            preview.observacao ||
              'Nenhuma'
          )}
        </section>

        <section class="review-section">
          <h4>
            Valores
          </h4>

          ${row(
            'Cálculo',
            preview.preco.descricao
          )}

          ${row(
            'Valor total',
            formatCurrency(
              preview.preco
                .valorTotal
            )
          )}

          ${row(
            'Sinal para gerar o protocolo',
            formatCurrency(
              preview.preco
                .valorAPagarAgora
            )
          )}

          ${row(
            'Saldo restante',
            formatCurrency(
              preview.preco
                .saldoPendente
            )
          )}

          <strong
            class="summary-price"
          >
            Disponibilidade verificada
          </strong>
        </section>
      `;
  }

  function renderPayment() {
    if (!state.preview) {
      return;
    }

    const price =
      state.preview.preco;

    document
      .getElementById(
        'paymentSummary'
      )
      .innerHTML = `
        <span>
          Valor do sinal para este pré-agendamento
        </span>

        <strong
          class="payment-value"
        >
          ${formatCurrency(
            price.valorAPagarAgora
          )}
        </strong>

        <span
          class="payment-balance"
        >
          Valor total:
          ${formatCurrency(
            price.valorTotal
          )}
          · Saldo restante:
          ${formatCurrency(
            price.saldoPendente
          )}
        </span>
      `;

    document
      .getElementById(
        'pixKeyText'
      )
      .textContent =
      `Chave Pix: ${config.pixKey}`;

    const fileInput =
      document.getElementById(
        'comprovanteArquivo'
      );

    fileInput.value = '';

    state.comprovante = null;

    document
      .getElementById(
        'fileHelp'
      )
      .textContent =
      `Tamanho máximo: ${config.maxComprovanteMB} MB.`;
  }

  function comprovanteMime(file) {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (allowedTypes.includes(file.type)) {
      return file.type;
    }

    const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
    const byExtension = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };

    return byExtension[extension] || '';
  }

  function validatePayment() {
    const file =
      document
        .getElementById(
          'comprovanteArquivo'
        )
        .files[0];

    if (!file) {
      return 'Selecione o comprovante do Pix para continuar.';
    }

    const mime = comprovanteMime(file);

    if (!mime) {
      return 'Envie o comprovante em PDF, JPG, PNG ou WEBP.';
    }

    if (
      file.size >
      config.maxComprovanteMB *
        1024 *
        1024
    ) {
      return (
        `O comprovante deve ter no máximo ` +
        `${config.maxComprovanteMB} MB.`
      );
    }

    state.comprovante =
      file;

    return null;
  }

  async function finalizeBooking() {
    const validationError = validatePayment();

    if (validationError) {
      return validationError;
    }

    setLoading(true, 'Enviando comprovante...');

    try {
      const agendamento = buildPayload();
      const file = state.comprovante;
      const mime = comprovanteMime(file);

      const autorizacao = await api('/api/comprovantes/autorizacao', {
        method: 'POST',
        body: JSON.stringify({
          agendamento,
          arquivo: {
            nomeArquivo: file.name,
            mime,
            tamanho: file.size,
          },
        }),
      });

      const blob = await uploadBlob(autorizacao.pathname, file, {
        access: 'private',
        handleUploadUrl: '/api/comprovantes/upload',
        clientPayload: autorizacao.uploadTicket,
        contentType: mime,
      });

      setLoading(true, 'Criando sua reserva...');

      const result = await api('/api/pre-agendamentos', {
        method: 'POST',
        body: JSON.stringify({
          ...agendamento,
          comprovante: {
            uploadTicket: autorizacao.uploadTicket,
            pathname: blob.pathname,
            nomeArquivo: file.name,
            mime: blob.contentType || mime,
            tamanho: file.size,
          },
        }),
      });

      state.result = result;
      goToStep(STEPS.indexOf('success'));
      return null;
    } catch (error) {
      return error.message;
    } finally {
      setLoading(false);
    }
  }

  function renderSuccess() {
    if (!state.result) {
      return;
    }

    document
      .getElementById(
        'successProtocol'
      )
      .textContent =
      state.result.reserva
        .protocolo;

    document
      .getElementById(
        'successMessage'
      )
      .textContent =
      state.result.mensagem;

    document
      .getElementById(
        'whatsappSend'
      )
      .href =
      state.result.whatsappUrl;
  }

  async function copyText(
    value,
    button
  ) {
    try {
      await navigator.clipboard.writeText(
        value
      );
    } catch (_) {
      const textarea =
        document.createElement(
          'textarea'
        );

      textarea.value = value;

      textarea.style.position =
        'fixed';

      textarea.style.opacity =
        '0';

      document.body.appendChild(
        textarea
      );

      textarea.select();

      document.execCommand(
        'copy'
      );

      textarea.remove();
    }

    if (button) {
      const original =
        button.textContent;

      button.textContent =
        'Copiado!';

      setTimeout(() => {
        button.textContent =
          original;
      }, 1400);
    }
  }

  function resetWizard() {
    state =
      createInitialState();

    form.reset();

    document
      .getElementById(
        'detailsFields'
      )
      .innerHTML = '';

    document
      .getElementById(
        'petsFields'
      )
      .innerHTML = '';

    document
      .getElementById(
        'reviewBox'
      )
      .innerHTML = '';

    document
      .getElementById(
        'paymentSummary'
      )
      .innerHTML = '';

    clearHumanNotice();
    renderSelectedServiceAnimation();

    document
      .querySelectorAll(
        '.service-card, .choice-card'
      )
      .forEach(
        (card) =>
          card.classList.remove(
            'is-selected'
          )
      );

    goToStep(0);
  }

  async function nextStep() {
    if (!serverReady) {
      showError(
        'O servidor não está disponível. Execute iniciar.bat e abra o endereço informado no terminal.'
      );

      return;
    }

    const step =
      STEPS[state.stepIndex];

    let error = null;

    if (step === 'service') {
      error =
        validateService();
    }

    if (step === 'tutor') {
      error =
        validateTutor();
    }

    if (step === 'details') {
      error =
        validateDetails();
    }

    if (step === 'pets') {
      error =
        validatePets();
    }

    if (error) {
      showError(error);
      return;
    }

    if (step === 'pets') {
      const availabilityError =
        await checkAvailability();

      if (availabilityError) {
        showError(
          availabilityError
        );

        return;
      }
    }

    if (step === 'payment') {
      const finalError =
        await finalizeBooking();

      if (finalError) {
        showError(
          finalError
        );
      }

      return;
    }

    if (
      state.stepIndex <
      STEPS.length - 1
    ) {
      goToStep(
        state.stepIndex + 1
      );
    }
  }

  btnNext.addEventListener(
    'click',
    nextStep
  );

  btnBack.addEventListener(
    'click',
    () => {
      if (
        state.stepIndex > 0 &&
        STEPS[state.stepIndex] !==
          'success'
      ) {
        goToStep(
          state.stepIndex - 1
        );
      }
    }
  );

  document
    .querySelectorAll(
      'input[name="service"]'
    )
    .forEach((radio) => {
      radio.addEventListener(
        'change',
        () =>
          selectService(
            radio.value
          )
      );
    });

  document
    .querySelectorAll(
      '.service-card'
    )
    .forEach((card) => {
      card.addEventListener(
        'click',
        () => {
          selectService(
            card.dataset.service
          );

          document
            .getElementById(
              'agendar'
            )
            .scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });

          goToStep(
            1,
            {
              scroll: false,
            }
          );
        }
      );
    });

  document
    .getElementById(
      'telefoneTutor'
    )
    .addEventListener(
      'input',
      (event) => {
        event.target.value =
          maskPhone(
            event.target.value
          );
      }
    );

  document
    .getElementById(
      'comprovanteArquivo'
    )
    .addEventListener(
      'change',
      (event) => {
        const file =
          event.target.files[0];

        state.comprovante =
          file ||
          null;

        document
          .getElementById(
            'fileHelp'
          )
          .textContent =
          file
            ? (
                `Arquivo selecionado: ` +
                `${file.name} · ` +
                `${(
                  file.size /
                  1024 /
                  1024
                ).toFixed(2)} MB`
              )
            : (
                `Tamanho máximo: ` +
                `${config.maxComprovanteMB} MB.`
              );
      }
    );

  document
    .getElementById(
      'copyPix'
    )
    .addEventListener(
      'click',
      (event) => {
        copyText(
          config.pixKey,
          event.currentTarget
        );
      }
    );

  document
    .getElementById(
      'copyProtocol'
    )
    .addEventListener(
      'click',
      (event) => {
        if (
          state.result?.reserva
            ?.protocolo
        ) {
          copyText(
            state.result
              .reserva
              .protocolo,
            event.currentTarget
          );
        }
      }
    );

  document
    .getElementById(
      'newBooking'
    )
    .addEventListener(
      'click',
      resetWizard
    );

  form.addEventListener(
    'submit',
    (event) =>
      event.preventDefault()
  );

  goToStep(
    0,
    {
      scroll: false,
    }
  );

  loadConfig().then(
    updateNavigation
  );
})();