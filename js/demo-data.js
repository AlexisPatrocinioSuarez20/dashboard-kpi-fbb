// Datos de ejemplo para el MODO DEMO (solo se usan cuando CLIENT_ID está vacío en config.js).
window.DEMO_DATA = function () {
  const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const H = ['N°', 'BRANCH', 'ZONE', 'BTS', 'OLT', 'DC MODEL', 'CSU MODEL', 'STATUS DC', 'MON. BY SRT', 'MON. BY BBU', 'STATUS OF BATT.', 'QTY BATT. ACIDO', 'TYPE OF BATT. ACIDO', 'QTY BATT. LITIO', 'TYPE OF BATT. LITIO', 'RECTIFIER MODEL', 'QTY OF MODULE RECTIFIER', '5G Consumption', 'POWER CONSUMPTION (W)', 'BATTERY DISCHARGE DURATION (HRS)', 'OPERATIONAL CAPACITY BATT.', '% UTILIZATION RECTIFIER', 'OPERATIONAL CAPACITY RECTIFIER', 'Provider', 'Saturation (%)', 'Active', 'Suspended'];
  const base = [
    ['ARE', 'ARE_EZ02', 'ARE0107', 'ZXDU68 B201 (V2.0)', 'CSU B121 ZTE', 'DC without mon.', 'Yes', 'BBU 5G', 'Batt with mon.', '0', '-', '5', 'Shoto 50 NEW', 'ZXD 2400', '2', '', '3761.00', '2.01', 'Need more batt.', '97.94%', 'Need more rectifier', 'Company', '87.50%', '25', '3'],
    ['LI4', 'CAL_Z06', 'CAL0056', 'ZXDU68 B301 (V5.0R06M01)', 'ZTE CSU501B', 'DC with mon.', 'Yes', 'BBU 5G', 'Batt with mon.', '0', '-', '5', 'ZTT-4850-P-V82018', 'ZXD 3000 (V5.5)', '2', '', '2902.78', '2.60', 'Batt. OK', '60.47%', 'Rectifier OK', 'Company', '80.12%', '650', '164'],
    ['CUS', 'CUS_Z20', 'CUS0288', 'ZXDU68 B301 (V5.0R20M01)', 'ZTE CSU501B', 'DC with mon.', 'Yes', 'BBU 5G', 'BTS without batt', '0', '-', '5', 'VMC (VMB48C50)', 'ZXD 3000 (V5.5)', '3', '', '3011.00', '2.51', 'Batt. OK', '41.82%', 'Rectifier OK', 'Company-BT5', '80.98%', '380', '67'],
    ['LAL', 'LAL_Z18', 'LAL0136', 'ZXDU68 B201 (V2.0)', 'CSU B121 ZTE', 'DC without mon.', 'Yes', 'BBU 5G', 'Batt with mon.', '0', '-', '10', 'Coss light 100 AH', 'ZXD 2400', '2', '', '4778.24', '3.16', 'Batt. OK', '124.43%', 'Need more rectifier', 'Company', '71.06%', '450', '73'],
    ['LAL', 'HUA_Z01', 'LAL0010', 'ZXDU68 B301 (V6.0)', 'CSU602A - ZTE', 'DC with mon.', 'Yes', 'BBU 5G', 'Batt with mon.', '0', '-', '4', 'Coss light 100 AH', 'ZXEPS R4850F1', '3', '', '4316.20', '1.40', 'Need more batt.', '59.95%', 'Rectifier OK', 'Company', '68.06%', '181', '15'],
    ['CUS', 'CUS_EZ01', 'CUS0035', 'ZXDU68 B301 (V6.0)', 'CSU602A - ZTE', 'DC with mon.', 'Yes', 'BBU 5G', 'Batt without mon.', '0', '-', '8', 'Coss light 100 AH', 'PS4850-2900 Emerson', '6', '', '6271.00', '1.93', 'Need more batt.', '45.05%', 'Rectifier OK', 'Company', '62.50%', '10', '0'],
    ['LI3', 'SUC_EZ02', 'LIC0564', 'ZXDU68 B301 (V5.0R20M01)', 'ZTE CSU501B', 'DC with mon.', 'Yes', 'BBU 4G', 'Batt with mon.', '0', '-', '5', 'Shoto 50 OLD', 'ZXD 3000 (V5.5)', '3', '', '4642.59', '1.63', 'Need more batt.', '64.48%', 'Rectifier OK', 'Company', '62.50%', '5', '0'],
    ['PIU', 'PIU_EZ01', 'PIU0188', 'ZXDU68 B201 (V2.0)', 'CSU B121 ZTE', 'DC without mon.', 'No', 'BBU 4G', 'Batt with mon.', '0', '-', '4', 'Coss light 100 AH', 'ZXD 2400', '3', '', '4032.87', '1.50', 'Need more batt.', '70.02%', 'Rectifier OK', 'Company', '71.88%', '18', '5'],
    ['LI1', 'CAL_Z02', 'CAL0148', 'ZXDU68 B301 (V5.0R20M01)', 'ZTE CSU501B', 'DC without mon.', 'Yes', 'BBU 5G', 'Batt without mon.', '1', 'Acido 100AH', '0', '-', 'ZXD 3000 (V5.5)', '2', '', '3316.00', '0.50', 'Need more batt.', '46.06%', 'Rectifier OK', 'Company', '69.20%', '80', '8'],
    ['LI3', 'LIC_Z11', 'LIC0905', 'ZXDU68 B201 (V5.0)', 'Integrated CSU', 'DC with mon.', 'No', 'BBU 5G', 'Batt with mon.', '0', '-', '2', 'Litio 50AH', 'ZXD 3000 (V5.5)', '2', '', '4191.00', '1.60', 'Need more batt.', '87.31%', 'Need more rectifier', 'Company-BT5', '68.75%', '5', '1']
  ];
  const main = [H].concat(base.map((r, i) => [String(i + 1), r[0], r[1], r[2], r[2] + 'OLT01'].concat(r.slice(3))));

  const wa = (id, date, bts, branch, subs, q) => [id, date, bts, branch, subs,
    `Fecha del incidente: ${date}\n+${bts} || ${branch} || Clientes afectados: ${subs}\n- ¿Qué pasó?: ${q[0]}\n- ¿Por qué pasó?: ${q[1]}\n- ¿Por qué falló la protección?: ${q[2]}\n- ¿Autonomía batería?: ${q[3]}\n- ¿Qué acción se tomó?: ${q[4]}\n- ¿Qué se hará para que no se repita?: ${q[5]}`, ''];

  const tpl = window.DAILY_TEMPLATE();
  const r2 = JSON.parse(JSON.stringify(tpl)); r2.date = d(2);
  r2.metrics.forEach(m => { m.value = { TT: 4176, WO_CREADAS: 190, WO_ONLINE: 280, WO_CERRADAS: 41, OLT_CAIDAS: 5, WO_IMPL: 96, ACS: 60, LI4_LINEAS: 14 }[m.key]; m.prev = ''; });
  r2.items[5].body = r2.items[5].body.replace('- 18/11: Se agregó configuración a 4 OLTs con alto % de clientes activos.(CAL0056, CAL0121, CAL0073, CAL0071)', '');
  const r1 = JSON.parse(JSON.stringify(tpl)); r1.date = d(1);
  r1.metrics.forEach(m => { m.prev = ''; });

  return {
    [window.APP_CONFIG.MAIN_SHEET]: main,
    WA_History: [['ID', 'Date', 'BTS', 'Branch', 'Subs', 'Message', 'Collage'],
      wa(1001, d(1), 'CAL0148', 'LI1', 88, ['BTS caida', 'DC de BTS no soporta monitoreo', 'Incidencia de red, se llamo a Branch, pero sin respuesta ni detalle', '1 bateria con una duración teorica de 0.5 hrs.', 'Se recupero monitoreo en BTS y en consecuencia a la OLT', 'Se solicitó habilitar OSPF (VLAN .1000) en CAL0076']),
      wa(1002, d(0), 'LAL0064', 'LAL', 152, ['Corte de fibra ADSS 24 Hilos', 'Cambio de postes por empresa electrica, empresa electrica no informo', 'No se tuvo algún comunicado por parte de la empresa electrica', '3 baterias de litio con una duración teorica de 1.2 hrs', 'Recableado de 150m y fusión de hilos (Aún en proceso)', 'Cableado con mayor altura y soporte para evitar dañar nuestra fibra']),
      wa(1003, d(0), 'LIC1155', 'LI1', 16, ['Corte de fibra ADSS', 'Corte por terceros', 'Altura correcta, terceros cortan cableado', '6 baterias de litio con una duración de 7 hrs teoricas', 'Se realizo recableado', 'Uso mayor de ferreterias y altura correcta en el despliegue'])
    ],
    Daily_Report: [['Date', 'Data (JSON - no editar)', 'WhatsApp Text', 'Updated At', 'Updated By'],
      [r2.date, JSON.stringify(r2), '', '', 'demo'],
      [r1.date, JSON.stringify(r1), '', '', 'demo']]
  };
};
