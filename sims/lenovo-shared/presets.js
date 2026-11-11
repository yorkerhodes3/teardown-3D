import lenovo from './presets/lenovo-sr675-v3.json';
import dell from './presets/dell-r760xa.json';
import hpe from './presets/hpe-dl380a-gen11.json';
import supermicro from './presets/supermicro-as4125gs.json';

export const PRESETS = [
  {id: 'lenovo-sr675-v3', name: 'Lenovo SR675 V3 · AMD', bom: lenovo},
  {id: 'dell-r760xa', name: 'Dell R760xa · Intel', bom: dell},
  {id: 'hpe-dl380a-gen11', name: 'HPE DL380a Gen11 · Intel', bom: hpe},
  {id: 'supermicro-as4125gs', name: 'Supermicro AS-4125GS · AMD', bom: supermicro},
];
