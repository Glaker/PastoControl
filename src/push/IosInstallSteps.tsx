import { Group, Stack, Text, ThemeIcon } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './push.module.css';

// Azul de los botones de iOS, para que el dibujo se parezca a lo que la persona ve en el iPhone.
const IOS_BLUE = '#007aff';

/** Instalar en el iPhone: Safari → Compartir → Agregar a inicio → Agregar, con un dibujo por paso. */
export function IosInstallSteps() {
  return (
    <Stack gap="md" component="ol" className={classes.steps}>
      <Step n={1} drawing={<ShareDrawing />}>
        En <b>Safari</b>, tocá el botón <b>Compartir</b>: el cuadrado con una flecha hacia arriba. Si no lo ves,
        tocá primero los tres puntos <b>(⋯)</b> de la barra de abajo.
      </Step>
      <Step n={2} drawing={<AddToHomeDrawing />}>
        En la lista que se abre, bajá y tocá <b>«Agregar a inicio»</b>. Si no aparece, tocá <b>«Ver más»</b>.
      </Step>
      <Step n={3} drawing={<ConfirmDrawing />}>
        Arriba a la derecha, tocá <b>«Agregar»</b>. Vas a ver el ícono de PastoControl en tu pantalla de inicio.
      </Step>
    </Stack>
  );
}

function Step({ n, drawing, children }: { n: number; drawing: ReactNode; children: ReactNode }) {
  return (
    <li className={classes.step}>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon size={32} radius="xl" variant="filled" color="blue" aria-hidden>
          <Text fw={700}>{n}</Text>
        </ThemeIcon>
        <Text style={{ flex: 1, minWidth: 0 }}>{children}</Text>
      </Group>
      <div className={classes.drawing} aria-hidden>
        {drawing}
      </div>
    </li>
  );
}

/** Barra de abajo de Safari con el botón Compartir resaltado. */
function ShareDrawing() {
  return (
    <svg viewBox="0 0 280 92" role="presentation">
      <rect x="6" y="6" width="268" height="80" rx="16" className={classes.svgPanel} />
      <rect x="22" y="16" width="236" height="24" rx="12" className={classes.svgField} />
      <text x="140" y="32" textAnchor="middle" className={classes.svgSmall}>
        pastocontrol.vercel.app
      </text>
      {/* atrás y adelante */}
      <path d="M44 56 l-7 7 l7 7" className={classes.svgIcon} />
      <path d="M86 56 l7 7 l-7 7" className={classes.svgIconFaint} />
      {/* Compartir */}
      <circle cx="140" cy="63" r="16" fill="none" stroke={IOS_BLUE} strokeWidth="3" />
      <path d="M133 60 h-2 v13 h18 v-13 h-2" fill="none" stroke={IOS_BLUE} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M140 53 v13 M135.5 57.5 l4.5 -4.5 l4.5 4.5" fill="none" stroke={IOS_BLUE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* libro y pestañas */}
      <path d="M188 57 q6 -3 12 0 q6 -3 12 0 v13 q-6 -3 -12 0 q-6 -3 -12 0 z M200 57 v13" className={classes.svgIcon} />
      <rect x="234" y="56" width="13" height="13" rx="3" className={classes.svgIcon} />
      <rect x="238" y="52" width="13" height="13" rx="3" className={classes.svgIcon} />
    </svg>
  );
}

/** Menú de Compartir con "Agregar a inicio" resaltado. */
function AddToHomeDrawing() {
  return (
    <svg viewBox="0 0 280 120" role="presentation">
      <rect x="6" y="6" width="268" height="108" rx="16" className={classes.svgPanel} />
      <rect x="18" y="16" width="244" height="26" rx="8" className={classes.svgField} />
      <text x="30" y="33" className={classes.svgText}>
        Copiar
      </text>
      <rect x="236" y="22" width="11" height="13" rx="2" className={classes.svgIcon} />
      <rect x="18" y="46" width="244" height="26" rx="8" className={classes.svgField} />
      <text x="30" y="63" className={classes.svgText}>
        Agregar a favoritos
      </text>
      <path d="M241 52 l2 4.5 l5 .5 l-3.8 3.3 l1.2 4.9 l-4.4 -2.7 l-4.4 2.7 l1.2 -4.9 l-3.8 -3.3 l5 -.5 z" className={classes.svgIcon} />
      {/* Agregar a inicio */}
      <rect x="18" y="78" width="244" height="28" rx="8" fill="#fff" stroke={IOS_BLUE} strokeWidth="3" />
      <text x="30" y="96" className={classes.svgTextStrong}>
        Agregar a inicio
      </text>
      <rect x="234" y="84" width="16" height="16" rx="4" fill="none" stroke={IOS_BLUE} strokeWidth="2" />
      <path d="M242 88 v8 M238 92 h8" stroke={IOS_BLUE} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Pantalla "Agregar a inicio" con el botón "Agregar" resaltado. */
function ConfirmDrawing() {
  return (
    <svg viewBox="0 0 280 104" role="presentation">
      <rect x="6" y="6" width="268" height="92" rx="16" className={classes.svgPanel} />
      <text x="16" y="32" style={{ fill: IOS_BLUE }} className={classes.svgText}>
        Cancelar
      </text>
      <text x="130" y="32" textAnchor="middle" className={classes.svgTextStrong}>
        Agregar a inicio
      </text>
      <rect x="198" y="14" width="68" height="28" rx="14" fill="none" stroke={IOS_BLUE} strokeWidth="3" />
      <text x="232" y="32" textAnchor="middle" style={{ fill: IOS_BLUE }} className={classes.svgTextStrong}>
        Agregar
      </text>
      <image href="/pwa-64x64.png" x="22" y="52" width="36" height="36" />
      <rect x="70" y="58" width="190" height="24" rx="6" className={classes.svgField} />
      <text x="80" y="74" className={classes.svgText}>
        PastoControl
      </text>
    </svg>
  );
}
