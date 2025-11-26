---
id: gnss_mavlink
title: MAVLink-пакети від плати GNSS sanity board
sidebar_label: MAVLink-поведінка
---

У цьому розділі описано, які **MAVLink-повідомлення** відправляє плата **GNSS sanity board на STM32F401**, як вони виглядають та як їх інтерпретувати в ArduPilot / Mission Planner.

---

## 1. Загальна схема взаємодії через MAVLink

Плата GNSS sanity board виступає як окремий **MAVLink-учасник** із власними `sysid` та `compid`.  
Взаємодія виглядає так:

~~~text
GNSS-приймач → GNSS sanity board → MAVLink по UART → автопілот (ArduPilot)
~~~

Основні типи повідомлень:

- GPS-дані:
  - `GPS_INPUT` **або** `HIL_GPS` (залежно від реалізації прошивки);
- сервісні повідомлення:
  - `STATUSTEXT` (логування стану, DR0/DR1, попередження про спуфінг);
- (опційно) `HEARTBEAT` від плати, якщо це реалізовано у вашій версії прошивки.

---

## 2. Ідентифікатори MAVLink

У вихідному коді використовуються константи на кшталт:

~~~cpp
static const uint8_t MY_SYSID  = 42;
static const uint8_t MY_COMPID = MAV_COMP_ID_ONBOARD_COMPUTER; // 191

static const uint8_t FC_SYSID  = 1;
static const uint8_t FC_COMPID = MAV_COMP_ID_AUTOPILOT1;       // 1
~~~

- `MY_SYSID`, `MY_COMPID` — ідентифікатори плати GNSS sanity board.
- `FC_SYSID`, `FC_COMPID` — ідентифікатори автопілота (ArduPilot).

**Важливо:** у всіх пакетах, які плата надсилає **автопілоту**, `target_system` та `target_component` мають відповідати `FC_SYSID` та `FC_COMPID`.  

> Якщо ви змінювали `SYSID_THISMAV` в ArduPilot, не забудьте оновити `FC_SYSID` у прошивці плати.

---

## 3. GPS-дані: повідомлення `GPS_INPUT` / `HIL_GPS`

Залежно від версії прошивки, плата може використовувати:

- `GPS_INPUT` (рекомендований варіант для зовнішніх GPS-постачальників),  
  або
- `HIL_GPS` (історично використовувався для HIL, але теж підходить для інʼєкції GPS).

### 3.1. Приклад структури `GPS_INPUT`

Умовний приклад заповнення:

~~~cpp
mavlink_gps_input_t gps_in;

gps_in.time_usec       = micros64();
gps_in.gps_id          = 0;
gps_in.ignore_flags    = 0;            // або маска полів, які ігноруються
gps_in.time_week_ms    = ubx_week_ms;
gps_in.time_week       = ubx_week;
gps_in.fix_type        = fix;         // 0..3
gps_in.lat             = lat * 1e7;
gps_in.lon             = lon * 1e7;
gps_in.alt             = alt;         // метри над MSL
gps_in.vn              = vel_n;       // швидкість по N (м/с)
gps_in.ve              = vel_e;       // швидкість по E (м/с)
gps_in.vd              = vel_d;       // швидкість по D (м/с)
gps_in.hdop            = hdop;
gps_in.vdop            = vdop;
gps_in.yaw             = heading_deg * 100.0f; // якщо доступний курс
gps_in.satellites_used = sats;
~~~

Пакет формується через:

~~~cpp
mavlink_message_t msg;
mavlink_msg_gps_input_pack(
    MY_SYSID,
    MY_COMPID,
    &msg,
    FC_SYSID,
    FC_COMPID,
    &gps_in
);
send_mavlink_to_fc(msg);
~~~

**Ключові поля:**

- `fix_type` — тип фікса (0–3).  
  В ArduPilot використовується для визначення 3D/2D fix.
- `lat`, `lon` — широта/довгота у форматі `* 1e7`.
- `alt` — висота (метри, як правило над MSL).
- `hdop`, `vdop` — точність по горизонталі/вертикалі.
- `satellites_used` — кількість супутників, використаних у рішенні.

У режимі DR плата:

- або не надсилає `GPS_INPUT` взагалі;
- або заморожує координати (`lat`, `lon`, `alt` беруться з останнього валідного виміру).

Це залежить від вашої конкретної конфігурації прошивки.

---

## 4. Сервісні повідомлення `STATUSTEXT`

Плата активно використовує `STATUSTEXT` для логування важливих подій:

- вхід у DR (`ENTER DR`);
- вихід із DR (`EXIT DR`);
- виявлення стрибка координат / швидкості;
- телепорт у Південну півкулю;
- інші діагностичні повідомлення.

Приклад функції відправки:

~~~cpp
static void send_status_text(uint8_t severity, const char *fmt, ...) {
    char buf[80];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);

    mavlink_message_t msg;
    mavlink_msg_statustext_pack(
        MY_SYSID,
        MY_COMPID,
        &msg,
        severity,
        buf,
        0 // id
    );
    send_mavlink_to_fc(msg);
}
~~~

Приклади текстів, які ви можете побачити в Mission Planner (вкладка **Messages**):

~~~text
GPS: ENTER DR (jump)
GPS: ENTER DR (no fix)
GPS: EXIT DR
SPOOF: SOUTH HEMI JUMP
~~~

**Рівні важливості (`severity`):**

- `MAV_SEVERITY_WARNING` — попередження (наприклад, вхід у DR).
- `MAV_SEVERITY_ERROR` — критична ситуація (телепорт, грубий спуфінг).
- `MAV_SEVERITY_INFO` — інформаційні події (вихід із DR, статистика).

---

## 5. (Опційно) HEARTBEAT від плати

У деяких версіях прошивки плата може надсилати `HEARTBEAT` як окремий MAVLink-учасник:

~~~cpp
mavlink_heartbeat_t hb{};
hb.type = MAV_TYPE_ONBOARD_CONTROLLER;
hb.autopilot = MAV_AUTOPILOT_INVALID;
hb.base_mode = 0;
hb.system_status = MAV_STATE_ACTIVE;

mavlink_message_t msg;
mavlink_msg_heartbeat_pack(
    MY_SYSID,
    MY_COMPID,
    &msg,
    hb.type,
    hb.autopilot,
    hb.base_mode,
    hb.custom_mode,
    hb.system_status
);
send_mavlink_to_fc(msg);
~~~

Це дозволяє:

- бачити плату як окремий девайс у **MAVLink Inspector**;
- відслідковувати її доступність/наявність в мережі.

Якщо ви не потребуєте `HEARTBEAT` від плати, цей блок у прошивці можна вимкнути, щоб зменшити трафік.

---

## 6. Як побачити пакети у Mission Planner

1. Підключіть Mission Planner до автопілота.
2. Відкрийте **Ctrl+F → MAVLink Inspector**.
3. Знайдіть:
   - `GPS_INPUT` або `HIL_GPS` з `sysid = MY_SYSID` (наприклад, 42);
   - `STATUSTEXT` з таким же `sysid`.
4. Переконайтеся, що:
   - частота `GPS_INPUT` стабільна (наприклад, 5–10 Гц);
   - `lat`, `lon`, `alt`, `hdop`, `satellites_used` мають адекватні значення;
   - при виникненні спуфінгу/аномалії зʼявляються відповідні `STATUSTEXT`.


---

## 7. Взаємодія з налаштуваннями ArduPilot

Щоб ArduPilot коректно приймав GPS від плати:

- на відповідному порту:

  - `SERIALx_PROTOCOL = 2` (MAVLink2) або `1` (MAVLink1, залежно від прошивки плати);
  - `SERIALx_BAUD = 115` (для 115200 бод, якщо саме така швидкість використовується).

- у GPS-параметрах:

  - `GPS_TYPE = 14` (**MAV** — GPS по MAVLink).

Якщо у вас є додатковий “залізний” GPS, ви можете:

- використовувати плату як **основне джерело GPS** (GNSS sanity board робить фільтрацію);
- або як другий GPS (наприклад, `GPS_TYPE2`), а далі налаштувати логіку перемикання в ArduPilot.

---

## 8. Що варто перевірити при налагодженні MAVLink

Короткий чек-лист:

1. **Чи йде будь-який MAVLink-трафік з плати?**
   - Підключіть USB-UART адаптер до лінії `FC_TX` та подивіться сирий HEX/ASCII.
2. **Чи збігаються `sysid` / `target_system` з `SYSID_THISMAV` автопілота?**
3. **Чи бачите ви `GPS_INPUT` / `HIL_GPS` у MAVLink Inspector?**
4. **Чи змінюються поля `lat`, `lon`, `fix_type`, `satellites_used` при зміні умов GNSS?**
5. **Чи отримуєте ви `STATUSTEXT` при вході/виході з DR?**
6. **Чи співпадає частота кадрів з очікуваною** (наприклад, 5–10 Гц для `GPS_INPUT`)?

Якщо все вище працює, але ArduPilot все одно не показує GPS:

- перевірте ще раз `SERIALx_PROTOCOL`, `SERIALx_BAUD`, `GPS_TYPE`;
- переконайтеся, що інші порти/модулі не конфліктують (наприклад, другий GPS на тому ж порту).

