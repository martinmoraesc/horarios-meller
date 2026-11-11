# Horarios Meller

Web para que el equipo de La Barra y Kul cargue sus horarios semana a semana. El sistema exige cubrir los mínimos por hora (fines de semana y tardecita pesan más), guarda todo y le manda a Martín un resumen por mail con CSV para compararlo con el reloj.

## Cómo publicarla (15 minutos)

1. Subí esta carpeta a un repositorio de GitHub (privado está bien).
2. En vercel.com: **Add New > Project**, elegí el repo y **Deploy**. No hace falta configurar nada de build.
3. En el proyecto: **Storage > Create > Upstash Redis** (Marketplace, plan gratis) y conectalo al proyecto. Vercel agrega solo las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
4. En **Settings > Environment Variables** cargá:
   - `APP_SECRET`: un texto largo al azar (firma las sesiones).
   - `CRON_SECRET`: otro texto largo al azar (protege los envíos automáticos).
   - `RESEND_API_KEY`: clave de resend.com (gratis). Con el remitente de prueba solo se puede mandar a tu mail, que es lo que necesitamos.
   - `MAIL_TO`: martinmoraesc@gmail.com
5. **Redeploy** (Deployments > ... > Redeploy).
6. Entrá a la web y tocá "Soy Martín": la primera vez te pide crear tu clave de administrador (mínimo 6 caracteres). Hacelo enseguida, antes de pasar el link a nadie. Después, en **Equipo**, creá el PIN de cada uno (lo escribís vos o se genera al azar) y mandáselo por WhatsApp.

Todas las claves se manejan desde la web: vos cambiás la tuya en **Equipo → Cambiar mi clave**, y cada persona puede cambiar su PIN con el botón "Cambiar PIN". Si algún día perdés tu clave, podés cargar `ADMIN_PIN` en Vercel (opcional) para entrar y crear otra.

## Cómo funciona

- **Hoy** es la solapa que se abre por defecto: quién trabaja hoy en cada local, quién está ahora, si el día está cubierto y un formulario para registrar horas extra.
- **Pantalla general del local:** en Panel → Equipo creás un código. Lo escribís una vez en la tablet o PC del local y queda abierta mostrando el día (se actualiza sola cada 5 minutos). Ahí cada uno registra sus horas extra con su nombre y PIN; no se pueden cambiar horarios.
- **Horas extra:** quedan pendientes hasta que las aprobás o rechazás en Panel → Horas extra. Salen en el mail semanal y en el CSV (tipo "hora extra").

- Cada persona entra con su nombre y PIN de 4 números, elige día libre, entrada y salida, y ve en cada día cuánta gente falta (rojo) y un botón "Cubrir lo que falta".
- No puede confirmar si: no llega a sus horas semanales, no tiene día libre, no respeta las 12 h de descanso, sale más tarde de lo permitido o no trabaja ningún fin de semana.
- Tampoco puede confirmar si su horario deja sin cubrir más de lo que el resto del equipo puede completar. En ese caso se le propone una combinación sugerida; si no puede cumplirla, "Confirmar igual y avisar a Martín" deja marcada la semana.
- Todo lo que se guarda queda en el **Registro** del panel (quién, cuándo, qué horario).
- Mails automáticos: jueves 12:00 (estado de la semana que viene) y domingo 20:00 (cierre de la semana, archivada). Desde el panel también podés pedirte el resumen cuando quieras.
- **CSV para el reloj**: una fila por persona y día con entrada, salida y horas.

## Etapas y requisitos

Están cargadas las de la planilla: La Barra (noviembre, 1–11/12, 12–18/12, 19/12–17/1 hasta las 00:00) y Kul (1–14/12 hasta las 21, 15/12–15/2 hasta las 23). Se editan en el panel, pestaña **Etapas**. Después del 17/1 en La Barra no hay requisitos cargados.

## Probar en tu computadora

    node dev.js        # abre http://localhost:3000, sin base real (usa memoria)
    npm test           # simula la carga de un equipo y muestra qué queda sin cubrir

Necesita Node 20 o más. No tiene dependencias.
