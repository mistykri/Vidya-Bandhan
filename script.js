/* script.js
  Single JS file that runs on all pages.
  - Uses localStorage for users, courses, chat
  - Uses IndexedDB (vanilla) for resource file blobs
  - Provides TTS and basic Web Speech captions (if supported)
  - AI Tutor fetches OpenAI directly (YOU provide key)
*/

/* ---------- Utilities: Local Storage / Init ---------- */
function uid() { return 'id-' + Math.random().toString(36).slice(2, 9); }

function ensureInit() {
  if (!localStorage.getItem('vb_users')) {
    const users = [
      { id: uid(), name: 'Demo Student', email: 'student@test.com', password: '1234', role: 'student', courseIds: [] },
      { id: uid(), name: 'Demo Teacher', email: 'teacher@test.com', password: '1234', role: 'teacher', courseIds: [] }
    ];
    localStorage.setItem('vb_users', JSON.stringify(users));
  }
  if (!localStorage.getItem('vb_courses')) localStorage.setItem('vb_courses', JSON.stringify([]));
}
ensureInit();

/* ---------- IndexedDB helper for resources (blobs) ---------- */
const DB_NAME = 'vidya-bandhan-db', DB_VER = 1, STORE_RES = 'resources';
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE_RES)) db.createObjectStore(STORE_RES, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function saveResourceToDB(resource) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_RES, 'readwrite');
    const store = tx.objectStore(STORE_RES);
    store.put(resource);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}
async function getResourcesFromDB() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_RES, 'readonly');
    const store = tx.objectStore(STORE_RES);
    const all = store.getAll();
    all.onsuccess = () => res(all.result || []);
    all.onerror = () => rej(all.error);
  });
}

/* ---------- Auth helpers ---------- */
function getUsers() { return JSON.parse(localStorage.getItem('vb_users')||'[]'); }
function setUsers(arr){ localStorage.setItem('vb_users', JSON.stringify(arr)); }
function getCourses(){ return JSON.parse(localStorage.getItem('vb_courses')||'[]'); }
function setCourses(arr){ localStorage.setItem('vb_courses', JSON.stringify(arr)); }

function setCurrentUser(u){ localStorage.setItem('vb_current', JSON.stringify(u)); }
function getCurrentUser(){ return JSON.parse(localStorage.getItem('vb_current')||'null'); }

/* ---------- Page: index.html (login/signup) ---------- */
if (document.body.id === 'page-index') {
  // elements
  const eLoginEmail = document.getElementById('login-email');
  const eLoginPass = document.getElementById('login-password');
  const eLoginMsg = document.getElementById('login-msg');
  const btnLogin = document.getElementById('btn-login');
  const btnGuest = document.getElementById('btn-guest');

  const eSName = document.getElementById('signup-name');
  const eSEmail = document.getElementById('signup-email');
  const eSPass = document.getElementById('signup-password');
  const eSRole = document.getElementById('signup-role');
  const btnSignup = document.getElementById('btn-signup');

  btnLogin.onclick = () => {
    const email = eLoginEmail.value.trim(), pass = eLoginPass.value;
    const u = getUsers().find(x => x.email === email && x.password === pass);
    if (!u) { eLoginMsg.textContent = 'Invalid credentials (demo: student@test.com / teacher@test.com)'; return; }
    setCurrentUser(u);
    if (u.role === 'teacher') window.location.href = 'teacher.html';
    else window.location.href = 'student.html';
  };

  btnGuest.onclick = () => {
    const users = getUsers();
    const student = users.find(u=>u.role==='student');
    setCurrentUser(student);
    window.location.href = 'student.html';
  };

  btnSignup.onclick = () => {
    const name = eSName.value.trim(), email = eSEmail.value.trim(), pass = eSPass.value, role = eSRole.value;
    if (!name || !email || !pass) return alert('Fill all fields');
    const users = getUsers();
    if (users.some(u => u.email === email)) return alert('Email in use');
    const newU = { id: uid(), name, email, password: pass, role, courseIds: [] };
    users.push(newU); setUsers(users);
    setCurrentUser(newU);
    alert('Account created. Redirecting...');
    window.location.href = role === 'teacher' ? 'teacher.html' : 'student.html';
  };
}

/* ---------- Page: teacher.html ---------- */
if (document.body.id === 'page-teacher') {
  const current = getCurrentUser(); if (!current) { alert('Not logged in'); location.href = 'index.html'; }
  document.getElementById('teacher-name').textContent = current.name + ' (' + current.role + ')';

  const titleInput = document.getElementById('course-title');
  const descInput = document.getElementById('course-desc');
  const btnCreate = document.getElementById('btn-create-course');
  const list = document.getElementById('teacher-courses');

  function renderCourses() {
    list.innerHTML = '';
    const courses = getCourses().filter(c => c.teacherId === current.id);
    if (courses.length === 0) list.innerHTML = '<div class="muted">You have no courses yet.</div>';
    courses.forEach(c => {
      const div = document.createElement('div'); div.className = 'item';
      const left = document.createElement('div');
      left.innerHTML = <strong>${c.title}</strong><div class="muted">${c.description}</div>;
      const right = document.createElement('div');
      const uploadBtn = document.createElement('button'); uploadBtn.className='btn'; uploadBtn.textContent='Upload Resource';
      const openBtn = document.createElement('button'); openBtn.className='btn primary'; openBtn.textContent='Open Class';
      uploadBtn.onclick = () => openUploadDialog(c);
      openBtn.onclick = () => { localStorage.setItem('vb_currentCourse', JSON.stringify(c)); window.location.href='classroom.html'; };
      right.appendChild(uploadBtn); right.appendChild(openBtn);
      div.appendChild(left); div.appendChild(right);
      list.appendChild(div);
    });
  }

  btnCreate.onclick = () => {
    const title = titleInput.value.trim(), desc = descInput.value.trim();
    if (!title) return alert('Enter title');
    const c = { id: uid(), title, description: desc, teacherId: current.id, resourceIds: [] };
    const courses = getCourses(); courses.push(c); setCourses(courses);
    // add course id to teacher
    const users = getUsers().map(u => u.id===current.id ? ({ ...u, courseIds: [...u.courseIds, c.id] }) : u);
    setUsers(users); setCurrentUser(users.find(u=>u.id===current.id));
    titleInput.value=''; descInput.value='';
    renderCourses();
  };

  function openUploadDialog(course) {
    // create file input dialog
    const input = document.createElement('input'); input.type='file';
    input.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result;
        const res = { id: uid(), courseId: course.id, title: file.name, type: file.type, data: base64, createdAt: Date.now() };
        await saveResourceToDB(res);
        // link resource id to course
        const courses = getCourses().map(cc => cc.id===course.id ? ({ ...cc, resourceIds: [...(cc.resourceIds||[]), res.id] }) : cc);
        setCourses(courses);
        alert('Resource saved locally for course: ' + course.title);
        renderCourses();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  // initial render
  renderCourses();
}

/* ---------- Page: student.html ---------- */
if (document.body.id === 'page-student') {
  const current = getCurrentUser(); if (!current) { alert('Not logged in'); location.href='index.html'; }
  document.getElementById('student-name').textContent = current.name + ' (' + current.role + ')';
  const list = document.getElementById('student-courses');
  const savedList = document.getElementById('saved-resources');

  async function render() {
    list.innerHTML=''; savedList.innerHTML='';
    const courses = getCourses();
    // student may not have courseIds if guest; show all courses to join
    const joinedIds = current.courseIds || [];
    const joined = courses.filter(c => joinedIds.includes(c.id));
    const available = courses.filter(c => !joinedIds.includes(c.id));

    if (joined.length===0) list.innerHTML = '<div class="muted">No enrolled courses yet. Join from available courses below.</div>';
    joined.forEach(c => {
      const div = document.createElement('div'); div.className='item';
      const left = document.createElement('div'); left.innerHTML=<strong>${c.title}</strong><div class="muted">${c.description}</div>;
      const right = document.createElement('div');
      const openBtn = document.createElement('button'); openBtn.className='btn primary'; openBtn.textContent='Open Class';
      openBtn.onclick = ()=> { localStorage.setItem('vb_currentCourse', JSON.stringify(c)); window.location.href='classroom.html'; };
      right.appendChild(openBtn);
      div.appendChild(left); div.appendChild(right); list.appendChild(div);
    });

    // show available courses with Join button
    if (available.length>0) {
      const h = document.createElement('div'); h.className='muted'; h.textContent='Available Courses (Join)';
      list.appendChild(h);
      available.forEach(c => {
        const div = document.createElement('div'); div.className='item';
        const left = document.createElement('div'); left.innerHTML=<strong>${c.title}</strong><div class="muted">${c.description}</div>;
        const right = document.createElement('div');
        const joinBtn = document.createElement('button'); joinBtn.className='btn success'; joinBtn.textContent='Join';
        joinBtn.onclick = () => { joinCourse(c.id); };
        right.appendChild(joinBtn);
        div.appendChild(left); div.appendChild(right); list.appendChild(div);
      });
    }

    // saved offline resources
    const allRes = await getResourcesFromDB();
    if (allRes.length === 0) savedList.innerHTML = '<div class="muted">No saved offline resources.</div>';
    allRes.forEach(r => {
      const div = document.createElement('div'); div.className='item';
      const left = document.createElement('div'); left.innerHTML=<strong>${r.title}</strong><div class="muted">Course: ${getCourses().find(c=>c.id===r.courseId)?.title||'N/A'}</div>;
      const right = document.createElement('div');
      const openBtn = document.createElement('button'); openBtn.className='btn'; openBtn.textContent='Open';
      openBtn.onclick = () => openResourceInPlayer(r);
      right.appendChild(openBtn);
      div.appendChild(left); div.appendChild(right); savedList.appendChild(div);
    });
  }

  function joinCourse(cid) {
    const users = getUsers().map(u => u.id===current.id ? ({ ...u, courseIds: [...(u.courseIds||[]), cid] }) : u);
    setUsers(users);
    setCurrentUser(users.find(u=>u.id===current.id));
    alert('Joined course');
    render();
  }

  function openResourceInPlayer(res) {
    // open new simple page to play base64 video or show pdf
    localStorage.setItem('vb_openResource', JSON.stringify(res));
    window.open('resource-view.html','_blank');
  }

  render();
}

/* ---------- Page: classroom.html ---------- */
if (document.body.id === 'page-class') {
  const current = getCurrentUser(); if (!current) { alert('Not logged in'); location.href='index.html'; }
  const course = JSON.parse(localStorage.getItem('vb_currentCourse') || 'null'); if (!course) { alert('No course selected'); location.href='student.html'; }
  document.getElementById('class-title').textContent = course.title;
  document.getElementById('class-course').textContent = getUsers().find(u=>u.id===course.teacherId)?.name || 'Teacher';

  // resources
  const resList = document.getElementById('course-resources');
  async function renderResources() {
    resList.innerHTML = '';
    const resources = await getResourcesFromDB();
    const courseRes = resources.filter(r => r.courseId === course.id);
    if (courseRes.length === 0) resList.innerHTML='<div class="muted">No resources yet</div>';
    courseRes.forEach(r => {
      const div = document.createElement('div'); div.className='item';
      const left = document.createElement('div'); left.innerHTML=<strong>${r.title}</strong><div class="muted">${r.type}</div>;
      const right = document.createElement('div');
      const openBtn = document.createElement('button'); openBtn.className='btn primary'; openBtn.textContent='Open';
      openBtn.onclick = () => playResource(r);
      const saveBtn = document.createElement('button'); saveBtn.className='btn'; saveBtn.textContent='Save Offline';
      saveBtn.onclick = async () => { alert('Already saved locally'); };
      right.appendChild(openBtn); right.appendChild(saveBtn);
      div.appendChild(left); div.appendChild(right); resList.appendChild(div);
    });
  }

  // player
  const videoArea = document.getElementById('video-area');
  function playResource(r) {
    videoArea.innerHTML = '';
    if (r.type.startsWith('video')) {
      const v = document.createElement('video'); v.controls = true; v.src = r.data; v.style.width='100%'; videoArea.appendChild(v);
    } else if (r.type === 'application/pdf') {
      const iframe = document.createElement('iframe'); iframe.src = r.data; iframe.style.width='100%'; iframe.style.height='500px'; videoArea.appendChild(iframe);
    } else {
      const pre = document.createElement('pre'); pre.textContent = 'Preview not available for this file type'; videoArea.appendChild(pre);
    }
  }

  // chat (localStorage per course)
  const chatBox = document.getElementById('chat-box');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  function getChatKey() { return vb_chat_${course.id}; }
  function getChat() { return JSON.parse(localStorage.getItem(getChatKey())||'[]'); }
  function setChat(arr){ localStorage.setItem(getChatKey(), JSON.stringify(arr)); }
  function renderChat() {
    chatBox.innerHTML = '';
    const msgs = getChat();
    msgs.forEach(m => {
      const div = document.createElement('div'); div.innerHTML = <strong>${m.user}</strong>: ${m.text};
      chatBox.appendChild(div);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  chatSend.onclick = () => {
    const txt = chatInput.value.trim(); if (!txt) return;
    const msgs = getChat(); msgs.push({ user: current.name, text: txt, t: Date.now() }); setChat(msgs); chatInput.value=''; renderChat();
  };

  // mark present (store attendance simple)
  document.getElementById('btn-mark-present').onclick = () => {
    const k = vb_att_${course.id}; const arr = JSON.parse(localStorage.getItem(k)||'[]'); arr.push({ userId: current.id, name: current.name, t: Date.now() }); localStorage.setItem(k, JSON.stringify(arr)); alert('Marked present');
  };

  // TTS
  document.getElementById('btn-tts').onclick = () => {
    const text = course.description || 'No description available';
    if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(text); window.speechSynthesis.speak(u); } else alert('TTS not supported');
  };

  // simple live captions using Web Speech API
  let recog = null;
  const liveCaption = document.getElementById('live-caption');
  document.getElementById('btn-start-captions').onclick = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return alert('Speech recognition not supported in this browser');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recog = new SpeechRecognition(); recog.continuous = true; recog.interimResults = true; recog.lang = 'en-IN';
    recog.onresult = (ev) => {
      let transcript = '';
      for (let i=ev.resultIndex;i<ev.results.length;i++){ transcript += ev.results[i][0].transcript; }
      liveCaption.textContent = transcript;
    };
    recog.start();
  };
  document.getElementById('btn-stop-captions').onclick = () => { if (recog) recog.stop(); liveCaption.textContent = ''; };

  renderResources(); renderChat();
}

/* ---------- Page: ai-tutor.html ---------- */
if (document.body.id === 'page-ai') {
  const keyInput = document.getElementById('openai-key');
  const qInput = document.getElementById('ai-question');
  const ansPre = document.getElementById('ai-answer');
  const btnAsk = document.getElementById('btn-ai-ask');
  const btnClear = document.getElementById('btn-ai-clear');

  btnAsk.onclick = async () => {
    const key = keyInput.value.trim(); const question = qInput.value.trim();
    if (!key) return alert('Paste your OpenAI API key (demo only)');
    if (!question) return alert('Write a question');
    ansPre.textContent = 'Thinking...';
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + key },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{role:'user', content: question}],
          max_tokens: 600
        })
      });
      const data = await resp.json();
      const answer = data?.choices?.[0]?.message?.content || JSON.stringify(data);
      ansPre.textContent = answer;
    } catch (e) { ansPre.textContent = 'Error: ' + e.message; }
  };
  btnClear.onclick = () => { qInput.value=''; ansPre.textContent='Answer will appear here.'; keyInput.value=''; };
}

/* ---------- Resource viewer page fallback (resource-view.html) ---------- */
/* If you want a separate resource viewer page, add a resource-view.html that reads localStorage.vb_openResource and displays base64 */