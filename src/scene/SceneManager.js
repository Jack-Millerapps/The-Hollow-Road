import * as THREE from 'three';

export const SceneManager = {
  scene: null,
  camera: null,
  renderer: null,
  fog: null,
  moonLight: null,
  ambient: null,

  init() {
    const scene = new THREE.Scene();
    const fog = new THREE.FogExp2(0x1a1208, 0.018);
    scene.fog = fog;
    scene.background = new THREE.Color(0x0a0804);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      600,
    );
    camera.position.set(0, 2.5, 0);
    camera.lookAt(0, 2.5, -10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;

    const app = document.getElementById('app');
    app.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x2d1f0e, 0.4);
    scene.add(ambient);

    const moonLight = new THREE.DirectionalLight(0x7b9ab5, 0.6);
    moonLight.position.set(10, 30, -20);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    moonLight.shadow.camera.near = 1;
    moonLight.shadow.camera.far = 120;
    moonLight.shadow.camera.left = -30;
    moonLight.shadow.camera.right = 30;
    moonLight.shadow.camera.top = 40;
    moonLight.shadow.camera.bottom = -40;
    moonLight.shadow.bias = -0.0005;
    scene.add(moonLight);
    scene.add(moonLight.target);

    window.addEventListener('resize', () => this.onResize());

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.fog = fog;
    this.moonLight = moonLight;
    this.ambient = ambient;

    return { scene, camera, renderer, fog };
  },

  onResize() {
    if (!this.renderer || !this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  },

  render() {
    this.renderer.render(this.scene, this.camera);
  },
};
