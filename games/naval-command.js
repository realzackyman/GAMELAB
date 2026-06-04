/* TACTICAL NAVAL COMMAND — Three.js microgame for GAME LAB */
function makeNavalCommand() {
  const { Game, W, H, keys, consumeKey, cv } = window.__LAB;
  const host = document.getElementById('gl-host');
  const hudScore = document.getElementById('naval-score');
  const hudStatus = document.getElementById('naval-status');
  const hudHealth = document.getElementById('naval-health');
  const hudRadarEnemy = document.getElementById('naval-enemy-blip');

  const VIEW_W = W;
  const VIEW_H = H;
  const GRID = 20;

  let renderer, scene, camera, player, enemy, cockpitMesh;
  let projectiles = [];
  let particles = [];
  let score = 0;
  let health = 100;
  let kills = 0;
  let enemyReloadTimer = 0;
  let enemyReloadMax = 140;
  let time = 0;
  let mounted = false;
  let winTargetKills = 1;
  let winTargetScore = 0;

  function mount() {
    if (mounted) return;
    cv.classList.add('hidden');
    host.classList.remove('hidden');
    host.classList.add('active');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010105);

    camera = new THREE.PerspectiveCamera(60, VIEW_W / VIEW_H, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(VIEW_W, VIEW_H);
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const dir = new THREE.DirectionalLight(0x00ffcc, 1.2);
    dir.position.set(5, 15, 5);
    scene.add(dir);

    const grid = new THREE.GridHelper(GRID, GRID, 0x00ffcc, 0x002233);
    scene.add(grid);

    player = new THREE.Group();
    player.position.set(0, 0, 6);
    scene.add(player);

    const cockpitGeo = new THREE.BoxGeometry(1.6, 1.0, 1.0);
    const cockpitWire = new THREE.WireframeGeometry(cockpitGeo);
    const cockpitMat = new THREE.LineBasicMaterial({ color: 0x00ffcc });
    cockpitMesh = new THREE.LineSegments(cockpitWire, cockpitMat);
    cockpitMesh.position.set(0, 0.6, -0.2);
    player.add(cockpitMesh);

    const bow = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 1.2, 4),
      new THREE.MeshPhongMaterial({ color: 0x00ffcc, wireframe: true })
    );
    bow.rotation.x = Math.PI / 2;
    bow.position.set(0, 0.2, -1.0);
    player.add(bow);

    enemy = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.6, 2.2),
      new THREE.MeshPhongMaterial({ color: 0xff1111, emissive: 0x220000 })
    );
    scene.add(enemy);

    mounted = true;
  }

  function unmount() {
    if (!mounted) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    projectiles = [];
    particles = [];
    renderer = null;
    scene = null;
    mounted = false;
    host.classList.add('hidden');
    host.classList.remove('active');
    cv.classList.remove('hidden');
    document.getElementById('naval-hud').classList.add('hidden');
  }

  function relocateEnemy() {
    enemy.position.x = Math.floor(Math.random() * 12) - 6;
    enemy.position.z = Math.floor(Math.random() * 8) - 5;
    enemy.position.y = 0.3;
    enemyReloadTimer = 40;
  }

  function resetRound() {
    score = 0;
    health = 100;
    kills = 0;
    projectiles = [];
    particles = [];
    time = 0;
    enemyReloadTimer = 0;
    player.position.set(0, 0, 6);
    player.rotation.x = 0;
    cockpitMesh.material.color.setHex(0x00ffcc);
    hudHealth.style.width = '100%';
    hudHealth.style.backgroundColor = '#00ff66';
    hudScore.textContent = 'SCORE: 0';
    hudStatus.textContent = 'SYS: ONLINE';
    relocateEnemy();
  }

  function spawnProjectile(sourcePos, targetPos, colorHex, isPlayerFiring) {
    if (isPlayerFiring) hudStatus.textContent = 'SYS: MISSILE LAUNCHED';
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: colorHex })
    );
    const startPos = sourcePos.clone();
    if (isPlayerFiring) startPos.add(new THREE.Vector3(0, 0.5, -1.0));
    else startPos.add(new THREE.Vector3(0, 0.3, 0));
    mesh.position.copy(startPos);
    scene.add(mesh);
    projectiles.push({
      mesh,
      start: startPos,
      target: targetPos.clone(),
      progress: 0,
      speed: isPlayerFiring ? 0.05 : 0.028,
      isPlayer: isPlayerFiring
    });
  }

  function createExplosion(position, colorHex) {
    const partGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(
        partGeo,
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 1 })
      );
      mesh.position.copy(position);
      scene.add(mesh);
      particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.25,
          Math.random() * 0.15 + 0.05,
          (Math.random() - 0.5) * 0.25
        ),
        life: 1,
        decay: 0.02 + Math.random() * 0.03
      });
    }
  }

  function damagePlayer(amount) {
    health -= amount;
    if (health < 0) health = 0;
    hudHealth.style.width = health + '%';
    if (health < 30) {
      hudHealth.style.backgroundColor = '#ff0033';
      hudStatus.textContent = 'WARNING: HULL CRITICAL';
      cockpitMesh.material.color.setHex(0xff0033);
    } else if (health < 60) {
      hudHealth.style.backgroundColor = '#ffaa00';
      hudStatus.textContent = 'SYS: DAMAGE DETECTED';
      cockpitMesh.material.color.setHex(0xffaa00);
    }
  }

  function updateRadar() {
    const maxRange = 12;
    const dx = enemy.position.x - player.position.x;
    const dz = enemy.position.z - player.position.z;
    let radarX = 50 + (dx / maxRange) * 50;
    let radarY = 50 + (dz / maxRange) * 50;
    radarX = Math.max(8, Math.min(92, radarX));
    radarY = Math.max(8, Math.min(92, radarY));
    if (health > 0) {
      hudRadarEnemy.style.left = radarX + '%';
      hudRadarEnemy.style.top = radarY + '%';
      hudRadarEnemy.style.display = 'block';
    } else {
      hudRadarEnemy.style.display = 'none';
    }
  }

  function tickNaval(g, dt) {
    if (!mounted || g.paused) return;

    if (consumeKey('Space')) spawnProjectile(player.position, enemy.position, 0xffff00, true);

    const half = GRID / 2;
    if (keys['ArrowUp'] && player.position.z > -half) player.position.z -= 1.2 * dt * 60;
    if (keys['ArrowDown'] && player.position.z < half) player.position.z += 1.2 * dt * 60;
    if (keys['ArrowLeft'] && player.position.x > -half) player.position.x -= 1.2 * dt * 60;
    if (keys['ArrowRight'] && player.position.x < half) player.position.x += 1.2 * dt * 60;

    time += dt * 2.5;
    camera.position.copy(player.position).add(new THREE.Vector3(0, 0.6, 0));
    camera.lookAt(player.position.x, 0.5, player.position.z - 5);

    if (health > 0) {
      player.position.y = Math.cos(time) * 0.02;
      player.rotation.x = Math.cos(time * 0.5) * 0.01;
      enemyReloadTimer++;
      if (enemyReloadTimer >= enemyReloadMax) {
        enemyReloadTimer = 0;
        hudStatus.textContent = 'WARNING: INCOMING FIRE';
        spawnProjectile(enemy.position, player.position, 0xff3300, false);
      }
    }

    enemy.position.y = 0.3 + Math.sin(time) * 0.04;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.progress += p.speed;
      if (p.progress >= 1) {
        if (p.isPlayer) {
          if (p.target.distanceTo(enemy.position) < 1.3) {
            score += 200;
            kills++;
            hudScore.textContent = 'SCORE: ' + score;
            hudStatus.textContent = 'SYS: DIRECT HIT';
            createExplosion(enemy.position, 0xff5500);
            relocateEnemy();
            if (kills >= winTargetKills || score >= winTargetScore) g.win();
          } else {
            hudStatus.textContent = 'SYS: SPLASH — MISSED';
            createExplosion(p.target, 0x00aaff);
          }
        } else if (health > 0) {
          if (p.target.distanceTo(player.position) < 1.5) {
            createExplosion(player.position, 0xff1100);
            damagePlayer(25);
            if (health <= 0) {
              createExplosion(player.position, 0xff3300);
              g.fail('SHIP DESTROYED');
            }
          } else {
            hudStatus.textContent = 'SYS: EVASIVE SUCCESS';
            createExplosion(p.target, 0x00aaff);
          }
        }
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
      } else {
        p.mesh.position.lerpVectors(p.start, p.target, p.progress);
        p.mesh.position.y = p.start.y + 2.5 * Math.sin(p.progress * Math.PI);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const part = particles[i];
      part.mesh.position.add(part.velocity);
      part.velocity.y -= 0.004;
      part.life -= part.decay;
      part.mesh.material.opacity = part.life;
      part.mesh.scale.setScalar(part.life);
      if (part.life <= 0) {
        scene.remove(part.mesh);
        particles.splice(i, 1);
      }
    }

    updateRadar();
    renderer.render(scene, camera);
  }

  const game = new Game('TACTICAL NAVAL COMMAND', [
    {
      instr: 'ARROWS move the bridge. SPACE fires ballistic arcs at the red target.',
      init(g) {
        mount();
        document.getElementById('naval-hud').classList.remove('hidden');
        winTargetKills = 1;
        winTargetScore = 0;
        enemyReloadMax = 200;
        resetRound();
      },
      update: tickNaval,
      draw() {}
    },
    {
      instr: 'Destroy 2 dreadnoughts. Enemy reloads faster.',
      init(g) {
        winTargetKills = 2;
        winTargetScore = 0;
        enemyReloadMax = 130;
        resetRound();
      },
      update: tickNaval,
      draw() {}
    },
    {
      instr: 'Score 600+ before your hull fails. Maximum threat.',
      init() {
        winTargetKills = 99;
        winTargetScore = 600;
        enemyReloadMax = 95;
        resetRound();
      },
      update: tickNaval,
      draw() {}
    }
  ]);

  game.draw = function () {
    if (mounted && renderer) renderer.render(scene, camera);
  };

  game.dispose = unmount;

  return game;
}
