/**
 * AI Master — Firebase 客户端集成
 * 用 Firebase Auth + Realtime Database 替代 Express 后端
 * 所有数据直接在前端读写，无需服务器
 */

// Firebase 配置（从 firebase-config.js 加载，注册后填入）
const firebaseConfig = window.FIREBASE_CONFIG || {
  apiKey: "AIzaSy_PLACEHOLDER_REPLACE_AFTER_FIREBASE_SETUP",
  authDomain: "ai-master-xxxxx.firebaseapp.com",
  databaseURL: "https://ai-master-xxxxx-default-rtdb.firebaseio.com",
  projectId: "ai-master-xxxxx",
  storageBucket: "ai-master-xxxxx.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};

// 检测是否为占位符配置（未注册 Firebase 时自动降级为本地模式）
const isPlaceholder = firebaseConfig.apiKey.includes('PLACEHOLDER');

// 初始化 Firebase（使用 compat SDK，通过 CDN 加载）
let auth = null, db = null, currentUser = null;

function initFirebase() {
  if (isPlaceholder) {
    console.info('[Firebase] 未配置（占位符），使用 localStorage 本地模式');
    return false;
  }
  if (typeof firebase === 'undefined') {
    console.warn('[Firebase] SDK 未加载，数据将使用本地降级模式');
    return false;
  }
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  auth = firebase.auth();
  db = firebase.database();

  // 监听认证状态
  auth.onAuthStateChanged(function(user) {
    currentUser = user;
  });
  return true;
}

// 检查是否已初始化
function ensureFirebase() {
  if (!db) initFirebase();
  return !!db;
}

// 获取当前用户 UID
function getUid() {
  if (!currentUser) {
    // 降级：使用 localStorage 模拟
    let guestId = localStorage.getItem('aimaster_guest_uid');
    if (!guestId) {
      guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      localStorage.setItem('aimaster_guest_uid', guestId);
    }
    return guestId;
  }
  return currentUser.uid;
}

// 判断是否为 Firebase 模式
function isFirebaseMode() {
  return !!db;
}

// ==================== Auth API ====================

const AuthAPI = {
  async login(username, password) {
    if (!ensureFirebase()) {
      // 降级：本地模式
      return { success: true, mode: 'local' };
    }
    try {
      // 用 username 构造 email（统一后缀）
      const email = username + '@aimaster.local';
      await auth.signInWithEmailAndPassword(email, password);
      return { success: true };
    } catch (err) {
      return { success: false, message: translateAuthError(err) };
    }
  },

  async register(username, password) {
    if (!ensureFirebase()) {
      return { success: true, mode: 'local' };
    }
    try {
      const email = username + '@aimaster.local';
      await auth.createUserWithEmailAndPassword(email, password);
      // 在数据库中创建用户记录
      const uid = auth.currentUser.uid;
      await db.ref('users/' + uid).set({
        name: username,
        login: username,
        state: 'active',
        created_at: Date.now(),
        wrong_answers: [],
        favorites: [],
        completed_kps: {},
        notes: {},
        mode: 'explore'
      });
      return { success: true };
    } catch (err) {
      return { success: false, message: translateAuthError(err) };
    }
  },

  async logout() {
    if (ensureFirebase() && currentUser) {
      await auth.signOut();
    }
    localStorage.removeItem('aimaster_guest_uid');
  }
};

// ==================== User Data API ====================

const UserAPI = {
  async getUserData() {
    const uid = getUid();

    // 降级：本地模式
    if (!ensureFirebase() || !currentUser) {
      return getLocalUserData();
    }

    const snap = await db.ref('users/' + uid).get();
    const data = snap.val() || {};
    return {
      success: true,
      username: data.name || '学习者',
      favorites: data.favorites || [],
      wrong_answers: data.wrong_answers || [],
      completed_kps: data.completed_kps || {},
      notes: data.notes || {},
      mode: data.mode || 'explore'
    };
  },

  async submitAnswer(answerData) {
    const uid = getUid();

    if (!ensureFirebase() || !currentUser) {
      return saveLocalAnswer(answerData);
    }

    const ref = db.ref('users/' + uid + '/answers').push();
    await ref.set({
      ...answerData,
      timestamp: Date.now()
    });

    // 如果答错，加入错题本
    if (answerData.correct === false) {
      await db.ref('users/' + uid + '/wrong_answers').push({
        question: answerData.question,
        user_answer: answerData.user_answer,
        correct_answer: answerData.correct_answer,
        chapter_id: answerData.chapter_id,
        kp_index: answerData.kp_index,
        timestamp: Date.now()
      });
    }
    return { success: true };
  },

  async completeKP(chapterId, kpIndex) {
    const uid = getUid();

    if (!ensureFirebase() || !currentUser) {
      return saveLocalCompleteKP(chapterId, kpIndex);
    }

    await db.ref('users/' + uid + '/completed_kps/' + chapterId + '_' + kpIndex).set(true);
    return { success: true };
  },

  async toggleFavorite(favData) {
    const uid = getUid();

    if (!ensureFirebase() || !currentUser) {
      return toggleLocalFavorite(favData);
    }

    const favRef = db.ref('users/' + uid + '/favorites');
    const snap = await favRef.get();
    const favorites = snap.val() || [];
    const idx = favorites.findIndex(f => f && f.question === favData.question);

    if (idx >= 0) {
      favorites.splice(idx, 1);
      await favRef.set(favorites);
      return { success: true, is_favorite: false };
    } else {
      favorites.push({ ...favData, timestamp: Date.now() });
      await favRef.set(favorites);
      return { success: true, is_favorite: true };
    }
  },

  async clearWrong(indices) {
    const uid = getUid();

    if (!ensureFirebase() || !currentUser) {
      return clearLocalWrong(indices);
    }

    const wrongRef = db.ref('users/' + uid + '/wrong_answers');
    const snap = await wrongRef.get();
    const wrong = snap.val() || {};
    const keys = Object.keys(wrong);
    const updates = {};
    indices.forEach(i => {
      if (keys[i]) updates[keys[i]] = null;
    });
    await wrongRef.update(updates);
    return { success: true };
  },

  async saveNote(chapterId, kpIndex, content) {
    const uid = getUid();
    const key = chapterId + '_' + kpIndex;

    if (!ensureFirebase() || !currentUser) {
      const notes = JSON.parse(localStorage.getItem('aimaster_notes') || '{}');
      notes[key] = content;
      localStorage.setItem('aimaster_notes', JSON.stringify(notes));
      return { success: true };
    }

    await db.ref('users/' + uid + '/notes/' + key).set(content);
    return { success: true };
  },

  async setMode(mode) {
    const uid = getUid();

    if (!ensureFirebase() || !currentUser) {
      localStorage.setItem('aimaster_mode', mode);
      return { success: true };
    }

    await db.ref('users/' + uid + '/mode').set(mode);
    return { success: true };
  }
};

// ==================== Mindmap API ====================

const MindmapAPI = {
  async get(chapterId) {
    const uid = getUid();
    if (!ensureFirebase() || !currentUser) {
      const data = JSON.parse(localStorage.getItem('aimaster_mindmaps') || '{}');
      return { success: true, data: data[chapterId] || null };
    }
    const snap = await db.ref('mindmaps/' + uid + '/' + chapterId).get();
    return { success: true, data: snap.val() };
  },

  async save(chapterId, mindmapData) {
    const uid = getUid();
    if (!ensureFirebase() || !currentUser) {
      const data = JSON.parse(localStorage.getItem('aimaster_mindmaps') || '{}');
      data[chapterId] = mindmapData;
      localStorage.setItem('aimaster_mindmaps', JSON.stringify(data));
      return { success: true };
    }
    await db.ref('mindmaps/' + uid + '/' + chapterId).set(mindmapData);
    return { success: true };
  },

  async delete(chapterId) {
    const uid = getUid();
    if (!ensureFirebase() || !currentUser) {
      const data = JSON.parse(localStorage.getItem('aimaster_mindmaps') || '{}');
      delete data[chapterId];
      localStorage.setItem('aimaster_mindmaps', JSON.stringify(data));
      return { success: true };
    }
    await db.ref('mindmaps/' + uid + '/' + chapterId).remove();
    return { success: true };
  }
};

// ==================== 本地降级模式 ====================

function getLocalUserData() {
  return {
    success: true,
    username: '本地学习者',
    favorites: JSON.parse(localStorage.getItem('aimaster_favorites') || '[]'),
    wrong_answers: JSON.parse(localStorage.getItem('aimaster_wrong') || '[]'),
    completed_kps: JSON.parse(localStorage.getItem('aimaster_completed') || '{}'),
    notes: JSON.parse(localStorage.getItem('aimaster_notes') || '{}'),
    mode: localStorage.getItem('aimaster_mode') || 'explore'
  };
}

function saveLocalAnswer(answerData) {
  const wrong = JSON.parse(localStorage.getItem('aimaster_wrong') || '[]');
  if (answerData.correct === false) {
    wrong.push({
      question: answerData.question,
      user_answer: answerData.user_answer,
      correct_answer: answerData.correct_answer,
      chapter_id: answerData.chapter_id,
      kp_index: answerData.kp_index
    });
    localStorage.setItem('aimaster_wrong', JSON.stringify(wrong));
  }
  return { success: true };
}

function saveLocalCompleteKP(chapterId, kpIndex) {
  const completed = JSON.parse(localStorage.getItem('aimaster_completed') || '{}');
  completed[chapterId + '_' + kpIndex] = true;
  localStorage.setItem('aimaster_completed', JSON.stringify(completed));
  return { success: true };
}

function toggleLocalFavorite(favData) {
  const favs = JSON.parse(localStorage.getItem('aimaster_favorites') || '[]');
  const idx = favs.findIndex(f => f && f.question === favData.question);
  if (idx >= 0) {
    favs.splice(idx, 1);
    localStorage.setItem('aimaster_favorites', JSON.stringify(favs));
    return { success: true, is_favorite: false };
  }
  favs.push({ ...favData, timestamp: Date.now() });
  localStorage.setItem('aimaster_favorites', JSON.stringify(favs));
  return { success: true, is_favorite: true };
}

function clearLocalWrong(indices) {
  let wrong = JSON.parse(localStorage.getItem('aimaster_wrong') || '[]');
  indices.sort((a, b) => b - a).forEach(i => wrong.splice(i, 1));
  localStorage.setItem('aimaster_wrong', JSON.stringify(wrong));
  return { success: true };
}

// ==================== Auth 错误翻译 ====================

function translateAuthError(err) {
  const code = err.code || '';
  const map = {
    'auth/invalid-email': '用户名格式不正确',
    'auth/user-disabled': '账户已被禁用',
    'auth/user-not-found': '用户不存在，请先注册',
    'auth/wrong-password': '密码错误',
    'auth/invalid-credential': '用户名或密码错误',
    'auth/email-already-in-use': '用户名已被注册',
    'auth/weak-password': '密码强度不足（至少6位）',
    'auth/network-request-failed': '网络连接失败，请检查网络',
    'auth/too-many-requests': '请求过于频繁，请稍后再试'
  };
  return map[code] || '操作失败：' + (err.message || code);
}

// ==================== 统一 API 入口 ====================

window.AIMasterAPI = {
  init: initFirebase,
  isFirebaseMode: isFirebaseMode,
  auth: AuthAPI,
  user: UserAPI,
  mindmap: MindmapAPI
};
