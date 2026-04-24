import * as THREE from 'three';
import { getSoftCircleTexture } from './spriteTextures.js';

const ROBE = 0x2a1d12;
const ROBE_LINING = 0x4a2c18;
const ROBE_TRIM = 0x6a4626;
const SKIN = 0xc9a684;
const BOOT = 0x0f0905;
const BELT = 0x1f1208;
const METAL_DARK = 0x1a1208;
const METAL_WARM = 0x3a2414;
const GLOW_WARM = 0xffb85a;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flatShading ?? true,
    ...opts,
  });
}

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.walkCycle = Math.random() * Math.PI * 2;
    this.moveIntensity = 0;
    this.lanternFlickerOffset = Math.random() * Math.PI * 2;
    this.baseBodyY = 0;
    this._build();
  }

  _build() {
    const body = new THREE.Group();
    this.body = body;
    this.root.add(body);

    // Hips pivot — holds legs so they swing from hips
    const hipsPivot = new THREE.Group();
    hipsPivot.position.y = 1.0;
    body.add(hipsPivot);
    this.hipsPivot = hipsPivot;

    // Torso (tapered cylinder) with a slightly wider shoulder cap
    const torsoMat = mat(ROBE, { roughness: 0.9 });
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.24, 0.7, 10),
      torsoMat,
    );
    torso.position.y = 1.4;
    torso.castShadow = true;
    body.add(torso);

    const shoulders = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.3, 0.12, 10),
      torsoMat,
    );
    shoulders.position.y = 1.72;
    shoulders.castShadow = true;
    body.add(shoulders);

    // Belt
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.31, 0.31, 0.07, 10),
      mat(BELT, { roughness: 0.7 }),
    );
    belt.position.y = 1.08;
    body.add(belt);

    const beltBuckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.06, 0.02),
      mat(0x6a4626, { metalness: 0.3, roughness: 0.4 }),
    );
    beltBuckle.position.set(0, 1.08, 0.32);
    body.add(beltBuckle);

    // Cloak — tapered cylinder going from shoulders down past knees
    const cloak = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.62, 1.25, 10, 1, true),
      new THREE.MeshStandardMaterial({
        color: ROBE,
        roughness: 0.95,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    );
    cloak.position.y = 1.2;
    cloak.position.z = -0.03;
    cloak.castShadow = true;
    body.add(cloak);
    this.cloak = cloak;

    // Cloak trim at the bottom hem
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.02, 4, 16),
      mat(ROBE_TRIM, { roughness: 0.8 }),
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.6;
    body.add(trim);

    // Head group (pivots around neck)
    const head = new THREE.Group();
    head.position.y = 1.88;
    body.add(head);
    this.head = head;

    const face = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 12),
      mat(SKIN, { roughness: 0.95 }),
    );
    face.castShadow = true;
    head.add(face);

    // Nose — a small nub giving the profile character
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.025, 0.06, 6),
      mat(SKIN, { roughness: 0.95 }),
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.01, -0.155);
    head.add(nose);

    // Two tiny eye glints — picks up moonlight in the hood shadow
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdcb0 });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 5), eyeMat);
    leftEye.position.set(-0.05, 0.02, -0.14);
    head.add(leftEye);
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 5), eyeMat);
    rightEye.position.set(0.05, 0.02, -0.14);
    head.add(rightEye);

    // Subtle brow ridges — small dark strokes just above eyes
    const browMat = new THREE.MeshBasicMaterial({ color: 0x1a0f08 });
    const leftBrow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.006, 0.012), browMat);
    leftBrow.position.set(-0.05, 0.048, -0.14);
    leftBrow.rotation.z = -0.1;
    head.add(leftBrow);
    const rightBrow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.006, 0.012), browMat);
    rightBrow.position.set(0.05, 0.048, -0.14);
    rightBrow.rotation.z = 0.1;
    head.add(rightBrow);

    // Hood — partial sphere wrapping the head
    const hoodMat = mat(ROBE, { roughness: 0.98 });
    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.72),
      hoodMat,
    );
    hood.position.y = 0.04;
    hood.castShadow = true;
    head.add(hood);

    // Hood cowl behind — adds silhouette
    const cowl = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.32, 10, 1, true),
      hoodMat,
    );
    cowl.position.set(0, -0.12, 0.14);
    cowl.rotation.x = 0.3;
    head.add(cowl);

    // Arms — left is free, right holds lantern
    this.leftArm = this._makeArm(false);
    this.leftArm.position.set(-0.34, 1.72, 0);
    body.add(this.leftArm);

    this.rightArm = this._makeArm(true);
    this.rightArm.position.set(0.34, 1.72, 0);
    body.add(this.rightArm);

    // Legs (children of hipsPivot so they swing correctly)
    this.leftLeg = this._makeLeg();
    this.leftLeg.position.set(-0.12, 0, 0);
    hipsPivot.add(this.leftLeg);

    this.rightLeg = this._makeLeg();
    this.rightLeg.position.set(0.12, 0, 0);
    hipsPivot.add(this.rightLeg);

    // Cape — wider, two-piece billowing back cape. Each piece sways
    // independently for fluid motion.
    const capeMatObj = new THREE.MeshStandardMaterial({
      color: ROBE_LINING,
      roughness: 0.95,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const capeGroup = new THREE.Group();
    capeGroup.position.set(0, 1.72, 0.2);
    body.add(capeGroup);
    this.capeGroup = capeGroup;

    const capeLeft = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 1.2, 2, 5),
      capeMatObj,
    );
    capeLeft.position.set(-0.18, -0.6, 0);
    capeLeft.rotation.y = 0.12;
    capeLeft.rotation.z = 0.08;
    capeLeft.castShadow = true;
    capeGroup.add(capeLeft);
    this.capeLeft = capeLeft;

    const capeRight = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 1.2, 2, 5),
      capeMatObj,
    );
    capeRight.position.set(0.18, -0.6, 0);
    capeRight.rotation.y = -0.12;
    capeRight.rotation.z = -0.08;
    capeRight.castShadow = true;
    capeGroup.add(capeRight);
    this.capeRight = capeRight;

    // Belt satchel
    const satchel = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.2, 0.14),
      mat(0x2e1a0a, { roughness: 0.9 }),
    );
    satchel.position.set(-0.24, 1.0, 0.12);
    satchel.castShadow = true;
    body.add(satchel);
    const satchelFlap = new THREE.Mesh(
      new THREE.BoxGeometry(0.23, 0.12, 0.02),
      mat(0x1e0f08, { roughness: 0.9 }),
    );
    satchelFlap.position.set(-0.24, 1.09, 0.19);
    satchelFlap.rotation.x = -0.15;
    body.add(satchelFlap);

    // Small talismanic charm dangling from cloak (warm emissive bead)
    const charmString = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.22, 4),
      mat(0x1a0f08, { roughness: 0.9 }),
    );
    charmString.position.set(0.12, 1.22, 0.33);
    body.add(charmString);
    const charm = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 6, 5),
      new THREE.MeshStandardMaterial({
        color: 0xffa054,
        emissive: 0xff9030,
        emissiveIntensity: 1.8,
        roughness: 0.4,
      }),
    );
    charm.position.set(0.12, 1.1, 0.33);
    body.add(charm);
  }

  _makeArm(holdLantern) {
    const shoulder = new THREE.Group();
    const armMat = mat(ROBE, { roughness: 0.9 });

    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.07, 0.36, 7),
      armMat,
    );
    upper.position.y = -0.18;
    upper.castShadow = true;
    shoulder.add(upper);

    // Forearm pivot so we can bend the elbow slightly
    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.065, 0.32, 7),
      armMat,
    );
    forearm.position.y = -0.16;
    forearm.castShadow = true;
    elbow.add(forearm);

    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.075, 0.06, 8),
      mat(ROBE_TRIM, { roughness: 0.85 }),
    );
    cuff.position.y = -0.31;
    elbow.add(cuff);

    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 8, 6),
      mat(SKIN, { roughness: 0.9 }),
    );
    hand.position.y = -0.36;
    hand.castShadow = true;
    elbow.add(hand);

    if (holdLantern) {
      // Elbow bends so lantern is carried forward
      elbow.rotation.x = -0.6;
      const lantern = this._makeLantern();
      lantern.position.set(0, -0.46, 0);
      elbow.add(lantern);
      this.lanternGroup = lantern;
      this.lanternLight = lantern.userData.light;
      this.lanternCore = lantern.userData.core;
      this.lanternGlow = lantern.userData.glow;
    } else {
      elbow.rotation.x = -0.25;
    }

    return shoulder;
  }

  _makeLantern() {
    const g = new THREE.Group();

    // Frame — narrow metal bands at top and bottom, four corner posts
    const frameMat = mat(METAL_DARK, { metalness: 0.6, roughness: 0.4 });
    const topCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.09, 0.03, 8),
      frameMat,
    );
    topCap.position.y = 0.12;
    g.add(topCap);

    const botCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.085, 0.03, 8),
      frameMat,
    );
    botCap.position.y = -0.12;
    g.add(botCap);

    // Four corner posts
    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.24, 0.012),
        frameMat,
      );
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      post.position.set(Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07);
      g.add(post);
    }

    // Glass panes — subtle tinted transparent
    for (let i = 0; i < 4; i++) {
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.11, 0.22),
        new THREE.MeshStandardMaterial({
          color: 0x5a3a14,
          emissive: 0xffa040,
          emissiveIntensity: 0.4,
          transparent: true,
          opacity: 0.35,
          roughness: 0.3,
          side: THREE.DoubleSide,
        }),
      );
      const a = (i / 4) * Math.PI * 2;
      pane.position.set(Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07);
      pane.rotation.y = a + Math.PI / 2;
      g.add(pane);
    }

    // Glowing core — small emissive sphere
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffd28a,
      emissive: GLOW_WARM,
      emissiveIntensity: 3.0,
      roughness: 0.4,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), coreMat);
    g.add(core);
    g.userData.core = core;

    // Soft glow billboard — additive plane that bleeds warmth outward
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getSoftCircleTexture(),
        color: GLOW_WARM,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.scale.set(0.6, 0.6, 1);
    g.add(glow);
    g.userData.glow = glow;

    // Pointed top hat
    const topHat = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.1, 8),
      frameMat,
    );
    topHat.position.y = 0.18;
    g.add(topHat);

    // Handle ring
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.04, 0.006, 4, 12, Math.PI),
      mat(METAL_WARM, { metalness: 0.4, roughness: 0.5 }),
    );
    handle.position.y = 0.24;
    handle.rotation.x = Math.PI / 2;
    g.add(handle);

    // Volumetric cone — short, subtle, illuminates area just below the lantern.
    // Tip at the lantern, base just below ground level to fake god-ray spread.
    const vol = new THREE.Mesh(
      new THREE.ConeGeometry(0.75, 1.3, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffa050,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      }),
    );
    vol.position.y = -0.6;
    g.add(vol);

    // Actual light source
    const light = new THREE.PointLight(0xffb864, 2.6, 16, 1.5);
    light.position.y = 0;
    light.castShadow = false;
    g.add(light);
    g.userData.light = light;

    return g;
  }

  _makeLeg() {
    const hip = new THREE.Group();
    const legMat = mat(ROBE, { roughness: 0.9 });
    const bootMat = mat(BOOT, { roughness: 0.65 });

    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.08, 0.42, 7),
      legMat,
    );
    thigh.position.y = -0.21;
    thigh.castShadow = true;
    hip.add(thigh);

    // Knee pivot
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);

    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.078, 0.07, 0.4, 7),
      legMat,
    );
    shin.position.y = -0.2;
    shin.castShadow = true;
    knee.add(shin);

    const boot = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.12, 0.22),
      bootMat,
    );
    boot.position.set(0, -0.43, 0.03);
    boot.castShadow = true;
    knee.add(boot);

    const toe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.055, 0.12, 8),
      bootMat,
    );
    toe.rotation.x = Math.PI / 2;
    toe.position.set(0, -0.46, 0.13);
    knee.add(toe);

    hip.userData.knee = knee;
    return hip;
  }

  setVisible(visible) {
    this.root.visible = visible;
  }

  update(delta, isMoving, time) {
    const target = isMoving ? 1 : 0;
    this.moveIntensity += (target - this.moveIntensity) * 0.15;

    // Advance walk cycle faster when moving
    const cycleSpeed = 9;
    const idleSpeed = 1.2;
    const mix = 0.3 + 0.7 * this.moveIntensity;
    this.walkCycle += delta * (idleSpeed + cycleSpeed * this.moveIntensity) * mix;

    const s = Math.sin(this.walkCycle);
    const c = Math.cos(this.walkCycle);
    const bob = Math.abs(Math.sin(this.walkCycle * 2));

    const legSwing = 0.55 * this.moveIntensity;
    const armSwing = 0.4 * this.moveIntensity;
    const bobAmp = 0.055 * this.moveIntensity;
    const swayAmp = 0.03 * this.moveIntensity;

    // Legs swing out of phase
    this.leftLeg.rotation.x = s * legSwing;
    this.rightLeg.rotation.x = -s * legSwing;

    // Knees flex slightly on the forward leg
    const leftKneeFlex = Math.max(0, -s) * 0.35 * this.moveIntensity;
    const rightKneeFlex = Math.max(0, s) * 0.35 * this.moveIntensity;
    this.leftLeg.userData.knee.rotation.x = leftKneeFlex;
    this.rightLeg.userData.knee.rotation.x = rightKneeFlex;

    // Arms counter-swing. Right arm carries lantern so it swings less.
    this.leftArm.rotation.x = -s * armSwing;
    this.rightArm.rotation.x = s * armSwing * 0.4;
    // Slight arm out-spread for idle
    const idleArmOut = 0.06 * (1 - this.moveIntensity);
    this.leftArm.rotation.z = 0.05 + idleArmOut;
    this.rightArm.rotation.z = -0.05 - idleArmOut;

    // Body bob + breathing
    const breath = Math.sin(time * 1.2) * 0.014;
    this.body.position.y = this.baseBodyY + bob * bobAmp + breath * (1 - this.moveIntensity * 0.6);

    // Body sway and forward lean
    this.body.rotation.z = s * swayAmp;
    this.body.rotation.x = this.moveIntensity * 0.05;

    // Head — slight counter-bob and occasional look-around when idle
    this.head.rotation.x = -s * 0.015 * this.moveIntensity + Math.sin(time * 0.4) * 0.03 * (1 - this.moveIntensity);
    this.head.rotation.y = Math.sin(time * 0.7) * 0.1 * (1 - this.moveIntensity);

    // Cape sways gently — each half oscillates with a slight phase offset
    if (this.capeLeft && this.capeRight) {
      const capeWave = c * 0.08 * this.moveIntensity + Math.sin(time * 1.8) * 0.03;
      this.capeLeft.rotation.x = 0.12 + capeWave;
      this.capeRight.rotation.x = 0.12 + capeWave * 0.9;
      this.capeLeft.rotation.z = 0.08 + Math.sin(time * 2.1 + 0.7) * 0.04;
      this.capeRight.rotation.z = -0.08 - Math.sin(time * 2.0) * 0.04;
    }

    // Lantern light flicker + glow pulse
    if (this.lanternLight) {
      const fl =
        0.85 +
        Math.sin(time * 7.2 + this.lanternFlickerOffset) * 0.06 +
        Math.sin(time * 13.3 + this.lanternFlickerOffset) * 0.04 +
        (Math.random() - 0.5) * 0.05;
      this.lanternLight.intensity = 2.6 * fl;
      if (this.lanternCore) {
        this.lanternCore.material.emissiveIntensity = 3.0 * fl;
      }
      if (this.lanternGlow) {
        this.lanternGlow.material.opacity = 0.45 + fl * 0.2;
        const sc = 0.55 + fl * 0.1;
        this.lanternGlow.scale.set(sc, sc, 1);
      }
    }
  }
}
