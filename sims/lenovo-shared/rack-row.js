import * as THREE from 'three';

// Simplified adjacent cabinets show the row. The focused rack retains the detailed, BOM-driven model.
export function createRackRow(boms) {
  const root = new THREE.Group();
  const aisle = new THREE.GridHelper(12, 24, '#adb2ba', '#d2d5da');
  aisle.position.y = 0.006;
  root.add(aisle);
  const targets = [];
  const pitch = 0.79;
  boms.forEach((bom, index) => {
    const cabinet = bom.catalog[bom.rack.part];
    const width = cabinet.dims[0] / 1000;
    const height = cabinet.dims[1] / 1000;
    const depth = cabinet.dims[2] / 1000;
    const x = (index - (boms.length - 1) / 2) * pitch;
    const group = new THREE.Group();
    group.position.x = x;
    const shell = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({color: '#25282d', roughness: 0.7}));
    shell.position.y = height / 2;
    shell.userData.rowIndex = index;
    group.add(shell);
    targets.push(shell);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.04, height - 0.1), new THREE.MeshStandardMaterial({color: '#15171a', roughness: 0.85}));
    face.position.set(0, height / 2, depth / 2 + 0.002);
    group.add(face);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const g = canvas.getContext('2d');
    g.fillStyle = bom.title.badgeColor;
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#fff';
    g.font = 'bold 68px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(bom.title.brand, 256, 64, 490);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.063), new THREE.MeshBasicMaterial({map: texture}));
    label.position.set(0, height - 0.16, depth / 2 + 0.006);
    group.add(label);
    for (const device of bom.rack.layout) {
      const units = device.server ? bom.servers[device.server].units : bom.catalog[device.part].units || 1;
      const y = (cabinet.plinth + (device.u - 1 + units / 2) * 44.45) / 1000;
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.13, Math.max(0.015, units * 0.035)), new THREE.MeshBasicMaterial({color: '#5d626b'}));
      slot.position.set(0, y, depth / 2 + 0.004);
      group.add(slot);
    }
    root.add(group);
  });
  root.visible = false;
  return {root, targets};
}
