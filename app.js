import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

// Storage Wrapper for Web/Mobile
const storage = {
  get: (keys, callback) => {
    let result = {};
    const getSingle = (key) => {
      try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : undefined;
      } catch (e) { return undefined; }
    };

    if (typeof keys === 'string') {
      result[keys] = getSingle(keys);
    } else if (Array.isArray(keys)) {
      keys.forEach(key => { result[key] = getSingle(key); });
    } else if (keys === null) {
      // Get all
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        result[key] = getSingle(key);
      }
    }
    if (callback) callback(result);
  },
  set: (items, callback) => {
    try {
      for (let key in items) {
        localStorage.setItem(key, JSON.stringify(items[key]));
      }
      if (callback) callback();
    } catch (e) {
      console.error('Storage set error:', e);
      alert('데이터 저장 중 오류가 발생했습니다. (저장 공간 부족 등)');
    }
  },
  remove: (keys, callback) => {
    try {
      if (typeof keys === 'string') {
        localStorage.removeItem(keys);
      } else if (Array.isArray(keys)) {
        keys.forEach(key => localStorage.removeItem(key));
      }
      if (callback) callback();
    } catch (e) {
      console.error('Storage remove error:', e);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // Service Worker Registration for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW registration failed', err));
  }

  const tabs = document.querySelectorAll('.nav-tab');
  const contentSections = document.querySelectorAll('.tab-content');
  const memoEditor = document.getElementById('memoEditor');
  const tocModal = document.getElementById('tocModal');
  const tocList = document.getElementById('tocList');
  const btnTOC = document.getElementById('btnTOC');
  const btnDownload = document.getElementById('btnDownload');
  const btnCollapseAll = document.getElementById('btnCollapseAll');
  const btnTOCClose = document.getElementById('btnTOCClose');
  const saveStatus = document.getElementById('saveStatus');

  let addressData = [];
  let addressSearchQuery = "";
  let selectedAddressId = null;
  let deleteMode = null; // 'bookmark', 'clipboard', 'address'

  // 1. Tab Switching Logic
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      // Update active tab button
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active content section
      contentSections.forEach(section => {
        section.classList.remove('active');
        if (section.id === targetTab) {
          section.classList.add('active');
        }
      });
    });
  });

  // Swipe Logic for Tab Switching
  let touchStartX = 0;
  let touchStartY = 0;
  const contentArea = document.querySelector('.content-area');

  contentArea.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  contentArea.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
  }, { passive: true });

  function handleSwipe(startX, startY, endX, endY) {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    
    // Ignore small swipes (min 80px) and vertical swipes (max 60px)
    if (Math.abs(deltaX) < 80 || Math.abs(deltaY) > 60) return;
    
    // Don't swipe if in edit mode or focus is on an input/textarea
    const activeEl = document.activeElement;
    if (isEditMode || (activeEl && ['INPUT', 'TEXTAREA'].includes(activeEl.tagName))) return;

    const currentTab = document.querySelector('.nav-tab.active');
    const tabList = Array.from(tabs);
    const currentIndex = tabList.indexOf(currentTab);
    
    if (deltaX > 20) {
      // Swipe Right -> Go to Previous Tab
      if (currentIndex > 0) tabList[currentIndex - 1].click();
    } else if (deltaX < -20) {
      // Swipe Left -> Go to Next Tab
      if (currentIndex < tabList.length - 1) tabList[currentIndex + 1].click();
    }
  }

  // 2. Memo Logic
  const btnEdit = document.getElementById('btnEdit');
  const btnClear = document.getElementById('btnClear');
  const btnSave = document.getElementById('btnSave');
  const memoActions = document.getElementById('memoActions');

  let isEditMode = false;

  // TipTap Editor Initialization
  let editor = new Editor({
    element: memoEditor,
    extensions: [
      StarterKit,
    ],
    content: '',
    editable: false,
    onUpdate({ editor }) {
      // Optional: Auto-save or other logic
    },
  });

  function setMode(editing) {
    isEditMode = editing;
    const editorEl = document.querySelector('.tiptap-editor');
    if (editorEl) {
      editorEl.classList.toggle('editing', editing);
    }
    
    if (editor) {
      editor.setEditable(editing);
      if (editing) {
        editor.commands.focus();
      }
    }
    
    if (isEditMode) {
      btnEdit.classList.add('hidden');
      btnClear.classList.remove('hidden');
      btnSave.classList.remove('hidden');
    } else {
      btnEdit.classList.remove('hidden');
      btnClear.classList.add('hidden');
      btnSave.classList.add('hidden');
    }
  }

  // Load saved memo
  const INITIAL_MEMO = "<h2>대방2차 925호 16500/10</h2><p>대방2차 925호<br>16500/10<br>5월 29일 ~6월 5일<br>이룸 물건 광고올리기</p><p></p>";
  storage.get(['memo'], (result) => {
    if (result.memo && editor) {
      editor.commands.setContent(result.memo);
    } else if (editor) {
      editor.commands.setContent(INITIAL_MEMO);
      storage.set({ memo: INITIAL_MEMO });
    }
    setMode(false);
  });

  // Edit button click
  btnEdit.addEventListener('click', () => {
    setMode(true);
  });

  // Clear button click
  btnClear.addEventListener('click', () => {
    if (editor) {
      editor.commands.clearContent();
    }
  });

  // Save button click
  btnSave.addEventListener('click', () => {
    if (editor) {
      const content = editor.getHTML();
      storage.set({ memo: content }, () => {
        setMode(false);
      });
    }
  });

  // Download memo as HTML file
  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      if (!editor) return;
      const content = editor.getHTML();
      if (!content || content === '<p></p>') {
        alert('저장할 내용이 없습니다.');
        return;
      }
      
      const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      // Try to find a title from headers
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      const firstHeader = tempDiv.querySelector('h1, h2, h3');
      let fileName = firstHeader ? firstHeader.innerText.trim().replace(/[\\/:*?"<>|]/g, '_') : '';
      
      if (!fileName) {
        const now = new Date();
        const dateStr = now.getFullYear() + 
                        String(now.getMonth() + 1).padStart(2, '0') + 
                        String(now.getDate()).padStart(2, '0') + "_" +
                        String(now.getHours()).padStart(2, '0') +
                        String(now.getMinutes()).padStart(2, '0');
        fileName = `memo_${dateStr}`;
      }
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  
  // Footer visibility depending on the active tab
  const bookmarkActions = document.getElementById('bookmarkActions');
  const clipboardActions = document.getElementById('clipboardActions');
  const addressActions = document.getElementById('addressActions');
  const pdfActionsEl = document.getElementById('pdfActions');
  
  function updateFooterVisibility(tabId) {
    memoActions.style.display = 'none';
    if(bookmarkActions) bookmarkActions.style.display = 'none';
    if(clipboardActions) clipboardActions.style.display = 'none';
    if(addressActions) addressActions.style.display = 'none';
    if(pdfActionsEl) pdfActionsEl.style.display = 'none';
    
    // Toggle buttons based on memo tab
    if (btnTOC) btnTOC.style.display = 'none'; // Hidden for now after TipTap migration
    if (btnDownload) btnDownload.style.display = (tabId === 'memo') ? 'block' : 'none';
    if (btnCollapseAll) btnCollapseAll.style.display = 'none'; // Hidden for now after TipTap migration

    if (tabId === 'memo') {
      memoActions.style.display = 'flex';
    } else if (tabId === 'bookmarks' && bookmarkActions) {
      bookmarkActions.style.display = 'flex';
    } else if (tabId === 'clipboard' && clipboardActions) {
      clipboardActions.style.display = 'flex';
    } else if (tabId === 'addresses' && addressActions) {
      addressActions.style.display = 'flex';
    } else if (tabId === 'pdfviewer' && pdfActionsEl) {
      pdfActionsEl.style.display = 'flex';
    }
  }
  
  // Update the tab switching logic to control footer visibility
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // ( existing tab logic is above, but we also want to update footer here )
      const targetTab = tab.getAttribute('data-tab');
      updateFooterVisibility(targetTab);
    });
  });

  // ----------------------------------------------------
  // 3. Bookmarks Logic
  // ----------------------------------------------------
  const GRID_SIZE = 60;
  const INITIAL_BOOKMARKS = [
  {
    "color": "#32D74B",
    "name": "부동산이지",
    "url": "https://bdseasy.com/dashboard"
  },
  {
    "color": "#32D74B",
    "name": "네이버웍스",
    "url": "https://board.worksmobile.com/"
  },
  {
    "color": "#32D74B",
    "name": "인터넷등기소",
    "url": "https://www.iros.go.kr/index.jsp"
  },
  {
    "color": "#32D74B",
    "name": "세움터",
    "url": "https://www.eais.go.kr/"
  },
  {
    "color": "#32D74B",
    "name": "서울 정보광장",
    "url": "https://land.seoul.go.kr/land/"
  },
  {
    "color": "#32D74B",
    "name": "렌트홈",
    "url": "https://www.renthome.go.kr/webportal/main/portalMainList.open"
  },
  {
    "color": "#32D74B",
    "name": "토지이음",
    "url": "https://www.eum.go.kr/web/am/amMain.jsp"
  },
  {
    "color": "#32D74B",
    "name": "정부24",
    "url": "https://plus.gov.kr/"
  },
  {
    "color": "#32D74B",
    "name": "깃허브",
    "url": "https://github.com"
  },
  {
    "color": "#32D74B",
    "name": "구글클라우드콘솔",
    "url": "https://console.cloud.google.com/welcome?project=dashboard-469600"
  },
  {
    "color": "#32D74B",
    "name": "파이어베이스",
    "url": "https://console.firebase.google.com/"
  },
  {
    "color": "#32D74B",
    "name": "버셀",
    "url": "https://vercel.com/insightyonis-projects"
  },
  {
    "color": "#32D74B",
    "name": "구글시트",
    "url": "https://docs.google.com/spreadsheets/u/0/"
  },
  {
    "color": "#32D74B",
    "name": "구글폼",
    "url": "https://docs.google.com/forms/u/0/"
  },
  {
    "color": "#32D74B",
    "name": "구글드라이브",
    "url": "https://drive.google.com/drive/"
  },
  {
    "color": "#32D74B",
    "name": "네이버메일",
    "url": "https://mail.naver.com/v2/folders/-1"
  },
  {
    "color": "#FFD60A",
    "name": "e-그린우편(DM발송)",
    "url": "https://service.epost.go.kr/hybridn.HybridIntro.postal?type=A"
  },
  {
    "color": "#FFD60A",
    "name": "*광고-부동산포스",
    "url": "https://www.rfine.kr/manage/index.php"
  },
  {
    "color": "#FFD60A",
    "name": "내 블로그",
    "url": "https://blog.naver.com/kindly98"
  },
  {
    "color": "#FFD60A",
    "name": "국토부 보도자료",
    "url": "https://www.molit.go.kr/USR/NEWS/m_71/lst.jsp?cate=1"
  },
  {
    "color": "#FF9F0A",
    "name": "홈택스(기준시가)",
    "url": "https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index4"
  },
  {
    "color": "#FF9F0A",
    "name": "공시가격 알리미",
    "url": "https://www.realtyprice.kr/notice/main/mainBody.htm"
  },
  {
    "color": "#FF9F0A",
    "name": "KB시세",
    "url": "https://kbland.kr/map?xy=37.5205559,126.9265729,16"
  },
  {
    "color": "#FF9F0A",
    "name": "테크시세",
    "url": "https://rtech.or.kr/main/mapSearch.do?posX="
  },
  {
    "color": "#FF453A",
    "name": "매물관리시스템",
    "url": "https://smartyoni.github.io/insite_management/"
  },
  {
    "color": "#FF453A",
    "name": "고객관리앱",
    "url": "https://smartyoni.github.io/FLOW-CRM/#"
  },
  {
    "color": "#FF453A",
    "name": "퍼스널대시보드",
    "url": "https://smartyoni.github.io/PERSONAL-Dashboard/"
  },
  {
    "color": "#FF453A",
    "name": "문서작성앱(마크다운)",
    "url": "https://page-writer.vercel.app/"
  },
  {
    "color": "#FF453A",
    "name": "임장앱(앱시트)",
    "url": "https://www.appsheet.com/start/b40722a2-0f6f-4e50-906d-ba3998842785?platform=desktop#appName=a_%EB%A7%A4%EB%AC%BC%EC%9E%84%EC%9E%A5%EB%8D%B0%EC%9D%B4%ED%84%B0%EC%A0%95%EB%A6%AC-5089294&vss=H4sIAAAAAAAAA6tWKstMLQ8uSUzOVrKKrkbwvFMrlayUqmOUQioLUmOUrGKUnPPzSoryc2KUdGKU_BJzIYJvmhtfbWh4O2PHm-4lbxZMfb15S4xSrVJtrA7MpJLUYiWranINsqKWi3SUMlNS80oy0zJTi0CmgswAmgY1ASgN0g8UwNStVKujlFtakpiUkwr2DlB3bS1QLC0_ubQ4NSUM6DyKnFXsmedaUZCYl-KbnwI0PC0xpzi1FgAbo46elwEAAA==&view=%EC%83%81%EA%B0%80%ED%98%B8%EC%8B%A4%EC%A0%95%EB%B3%B4"
  },
  {
    "color": "#FF453A",
    "name": "호실관리(앱시트)",
    "url": "https://www.appsheet.com/start/0fc8f520-2cc5-475c-af0c-99c06436e0dc?platform=desktop#appName=%EC%8A%A4%EB%A7%88%ED%8A%B8%ED%98%B8%EC%8B%A4%EA%B4%80%EB%A6%AC-5089294&vss=H4sIAAAAAAAAA6WOsQ3CMBREd7naE7hFFAhBA6LBFCb-kSwcO4odILI8AQswAEMwFOyAQ0DUEeV_X-_uIo6aTqsgiwP4Nv6uOXXgiALrriYBLjBxNjTOCDCBpawG-LzeH5ebQELasa8dyIPHMTL_p5lBK7JBl5qaPqn3csLHyu_eyWAwkBiqNsi9offUbKSUWemK1pPa5Bmj6_3MTs-1tGrhVA4spfGUXsQj-8hbAQAA&view=%ED%98%B8%EC%8B%A4"
  },
  {
    "color": "#FF453A",
    "name": "아카이브(앱시트)",
    "url": "https://www.appsheet.com/start/7101a668-bcf9-4aeb-95db-fa78d1859b7d?platform=desktop#appName=%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-5089294&vss=H4sIAAAAAAAAA6tWKstMLQ8uSUzOVrKKrkbwvFMrlayUqmOUQioLUmOUrGKUnPPzSoryc2KUdGKU_BJzIYJvmta8mbvlbdeOV1saXi9bE6NUq1QbqwMzpiS1WMmqmixTrKjiFh2lzJTUvJLMtMzUIpCRIAOARkG1A6VBmoECaFqVanWUcktLEpNyUsG-AGqtrQWKpeUnlxanpoQBHUa-g4o981wrChLzUnzzU4AmpyXmFKfWAgDUF0AdiAEAAA==&view=%EC%82%AC%EC%9D%B4%ED%8A%B8%EA%B4%80%EB%A6%AC"
  },
  {
    "color": "#FF453A",
    "name": "앱시트수정페이지",
    "url": "https://www.appsheet.com/home/apps"
  },
  {
    "color": "#BF5AF2",
    "name": "호갱노노",
    "url": "https://hogangnono.com/"
  },
  {
    "color": "#BF5AF2",
    "name": "아실(아파트실거래가)",
    "url": "https://asil.kr/asil/index.jsp"
  },
  {
    "color": "#BF5AF2",
    "name": "부동산지인",
    "url": "https://aptgin.com/root_main"
  },
  {
    "color": "#BF5AF2",
    "name": "디스코",
    "url": "https://www.disco.re/"
  },
  {
    "color": "#FF9F0A",
    "name": "공인중개사협회",
    "url": "https://공인중개사협회"
  },
  {
    "color": "#FF9F0A",
    "name": "미리캔버스",
    "url": "https://www.miricanvas.com/ko"
  },
  {
    "color": "#FF9F0A",
    "name": "성원애드피아",
    "url": "https://www.swadpia.co.kr/"
  },
  {
    "color": "#FF9F0A",
    "name": "텐 홈페이지",
    "url": "https://ten.co.kr"
  },
  {
    "color": "#0A84FF",
    "name": "건강보험",
    "url": "https://www.nhis.or.kr/nhis/index.do"
  },
  {
    "color": "#0A84FF",
    "name": "주소라벨(구글시트)",
    "url": "https://docs.google.com/spreadsheets/d/1jszo6dQS7nhNA6it2xgtjFGB6jQVyey2OQ5UVIbMjyg/edit?gid=1769831901#gid=1769831901"
  },
  {
    "color": "#0A84FF",
    "name": "제미나이",
    "url": "https://gemini.google.com/"
  },
  {
    "color": "#0A84FF",
    "name": "노트북lm",
    "url": "https://notebooklm.google.com/"
  },
  {
    "color": "#FF9F0A",
    "name": "마이토리툴스",
    "url": "https://tools.mytory.net/"
  },
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
];
  let bookmarks = [...INITIAL_BOOKMARKS];
  let selectedBookmarkIndex = null;
  let bookmarkSearchQuery = ''; // [FIX] Move declaration here

  const bookmarksGrid = document.getElementById('bookmarksGrid');
  const btnBookmarkEdit = document.getElementById('btnBookmarkEdit');
  const btnBookmarkDelete = document.getElementById('btnBookmarkDelete');
  
  // Modals
  const bookmarkModal = document.getElementById('bookmarkModal');
  const btnCancelBookmark = document.getElementById('btnCancelBookmark');
  const btnSaveBookmark = document.getElementById('btnSaveBookmark');
  const deleteModal = document.getElementById('deleteModal');
  const btnCancelDelete = document.getElementById('btnCancelDelete');
  const btnConfirmDelete = document.getElementById('btnConfirmDelete');

  // Input Fields
  const bmkNameInput = document.getElementById('bookmarkName');
  const bmkUrlInput = document.getElementById('bookmarkUrl');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  let selectedColor = '#0A84FF';

  // Load Bookmarks from storage
  storage.get(['bookmarks'], (result) => {
    if (result.bookmarks && Array.isArray(result.bookmarks)) {
      bookmarks = result.bookmarks;
      // Ensure it's exactly GRID_SIZE
      while (bookmarks.length < GRID_SIZE) bookmarks.push(null);
      if (bookmarks.length > GRID_SIZE) bookmarks = bookmarks.slice(0, GRID_SIZE);
    } else {
      // Save the hardcoded bookmarks to storage on first load
      storage.set({ bookmarks: bookmarks });
    }
    renderBookmarks();
  });

  function saveBookmarks() {
    storage.set({ bookmarks: bookmarks });
  }

  const bookmarkSearchInput = document.getElementById('bookmarkSearch');
  const clearBookmarkSearch = document.getElementById('clearBookmarkSearch');
  if (bookmarkSearchInput) {
    bookmarkSearchInput.addEventListener('input', (e) => {
      bookmarkSearchQuery = e.target.value.toLowerCase().trim();
      if (e.target.value.length > 0) clearBookmarkSearch.classList.add('visible');
      else clearBookmarkSearch.classList.remove('visible');
      renderBookmarks();
    });
    if (clearBookmarkSearch) {
      clearBookmarkSearch.addEventListener('click', () => {
        bookmarkSearchInput.value = '';
        bookmarkSearchInput.dispatchEvent(new Event('input'));
        bookmarkSearchInput.focus();
      });
    }

    bookmarkSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const firstItem = bookmarksGrid.querySelector('.bookmark-item');
        if (firstItem) {
          firstItem.focus();
          e.preventDefault();
        }
      }
    });
  }

  function renderBookmarks() {
    bookmarksGrid.innerHTML = '';
    bookmarks.forEach((bmk, index) => {
      if (bookmarkSearchQuery) {
        if (!bmk) return;
        const nameMatch = bmk.name && bmk.name.toLowerCase().includes(bookmarkSearchQuery);
        const urlMatch = bmk.url && bmk.url.toLowerCase().includes(bookmarkSearchQuery);
        if (!nameMatch && !urlMatch) return;
      }

      const item = document.createElement('div');
      item.className = 'bookmark-item';
      item.tabIndex = 0; // Make focusable
      if (index === selectedBookmarkIndex) {
        item.classList.add('selected');
      }

      if (bmk) {
        // Filled Bookmark
        item.style.backgroundColor = bmk.color || '#0A84FF';
        
        const nameNode = document.createElement('div');
        nameNode.className = 'bookmark-name';
        nameNode.textContent = bmk.name || '이름 없음';

        item.appendChild(nameNode);
      } else {
        // Empty Bookmark
        const emptyIcon = document.createElement('span');
        emptyIcon.className = 'bookmark-empty-icon';
        emptyIcon.textContent = '+';
        item.appendChild(emptyIcon);
      }

      // Handle Selection & Action
      item.addEventListener('click', () => {
        selectedBookmarkIndex = index;
        renderBookmarks(); // Re-render to update selected states
        updateFooterButtons();
        
        // Execute main function on single click
        if (bmk && bmk.url) {
          window.open(bmk.url, '_blank');
        }
      });

      // Handle Right Click for Quick Edit
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        selectedBookmarkIndex = index;
        renderBookmarks();
        updateFooterButtons();
        btnBookmarkEdit.click();
      });

      // Handle Enter Key to open URL or trigger selection
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          item.click();
          e.preventDefault();
        }
      });

      // Drag and Drop
      item.setAttribute('draggable', 'true');
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
        item.style.opacity = '0.4';
      });
      item.addEventListener('dragend', () => {
        item.style.opacity = '1';
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      item.addEventListener('dragenter', (e) => {
        e.preventDefault();
        item.classList.add('drag-over');
      });
      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });
      item.addEventListener('drop', (e) => {
        e.stopPropagation();
        item.classList.remove('drag-over');
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (!isNaN(fromIndex) && fromIndex !== index) {
          const temp = bookmarks[fromIndex];
          bookmarks[fromIndex] = bookmarks[index];
          bookmarks[index] = temp;
          
          if (selectedBookmarkIndex === fromIndex) selectedBookmarkIndex = index;
          else if (selectedBookmarkIndex === index) selectedBookmarkIndex = fromIndex;
          
          saveBookmarks();
          renderBookmarks();
          updateFooterButtons();
        }
      });

      bookmarksGrid.appendChild(item);
    });
  }

  function updateFooterButtons() {
    if (selectedBookmarkIndex !== null) {
      btnBookmarkEdit.disabled = false;
      const bmk = bookmarks[selectedBookmarkIndex];
      btnBookmarkDelete.disabled = !bmk; // Only enable Delete if it's not empty
    } else {
      btnBookmarkEdit.disabled = true;
      btnBookmarkDelete.disabled = true;
    }
  }

  // Edit Modal Handling
  btnBookmarkEdit.addEventListener('click', () => {
    if (selectedBookmarkIndex === null) return;
    
    const bmk = bookmarks[selectedBookmarkIndex];
    if (bmk) {
      bmkNameInput.value = bmk.name || '';
      bmkUrlInput.value = bmk.url || '';
      selectedColor = bmk.color || '#0A84FF';
    } else {
      bmkNameInput.value = '';
      bmkUrlInput.value = '';
      selectedColor = '#0A84FF';
    }
    
    updateSwatches();
    bookmarkModal.classList.remove('hidden');
  });

  btnCancelBookmark.addEventListener('click', () => {
    bookmarkModal.classList.add('hidden');
  });

  btnSaveBookmark.addEventListener('click', () => {
    let url = bmkUrlInput.value.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      url = 'https://' + url; // Auto-prepend https
    }
    const newBmk = {
      name: bmkNameInput.value.trim(),
      url: url,
      color: selectedColor
    };
    bookmarks[selectedBookmarkIndex] = newBmk;
    saveBookmarks();
    renderBookmarks();
    updateFooterButtons();
    bookmarkModal.classList.add('hidden');
  });

  // Color Swatch Selection
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      selectedColor = swatch.getAttribute('data-color');
      updateSwatches();
    });
  });

  function updateSwatches() {
    colorSwatches.forEach(swatch => {
      if (swatch.getAttribute('data-color') === selectedColor) {
        swatch.classList.add('active');
      } else {
        swatch.classList.remove('active');
      }
    });
  }

  // Delete Modal Handling
  btnBookmarkDelete.addEventListener('click', () => {
    if (selectedBookmarkIndex === null || !bookmarks[selectedBookmarkIndex]) return;
    deleteMode = 'bookmark';
    deleteModal.classList.remove('hidden');
  });

  btnCancelDelete.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
  });

  btnConfirmDelete.addEventListener('click', () => {
    if (deleteMode === 'bookmark') {
      bookmarks[selectedBookmarkIndex] = null;
      saveBookmarks();
      renderBookmarks();
      updateFooterButtons();
    } else if (deleteMode === 'clipboard') {
      clipboards[selectedClipboardIndex] = null;
      saveClipboards();
      renderClipboards();
      updateCbFooterButtons();
    } else if (deleteMode === 'address') {
      const idx = addressData.findIndex(a => a.id === selectedAddressId);
      if (idx > -1) {
        addressData.splice(idx, 1);
        storage.set({ addresses: addressData });
        renderAddresses();
      }
    }
    deleteModal.classList.add('hidden');
    // Also close detail modals if they were open
    if (deleteMode === 'clipboard') {
      const cvModal = document.getElementById('clipboardViewModal');
      if (cvModal) cvModal.classList.add('hidden');
    } else if (deleteMode === 'address') {
      const addressView = document.getElementById('addressViewModal');
      if (addressView) addressView.classList.add('hidden');
    }
  });

  // ----------------------------------------------------
  // 4. Clipboard Logic
  // ----------------------------------------------------
  const INITIAL_CLIPBOARDS = [
  {
    "color": "#BF5AF2",
    "text": "지하철5호선 마곡역 5번출구 도보1분\n차량이용시 강서구 마곡동 799-7 마곡그랑트윈타워 에이동 에 주차하시고 5층으로 올라오셔서 인사이트부동산으로 오시면 됩니다\n주차는 1시간 가능합니다.",
    "title": "오시는길"
  },
  {
    "color": "#BF5AF2",
    "text": "안녕하세요 오늘 시에 뵙기로한 인사이트부동산입니다. 일정에 변동있으신지 여쭤보려 연락드립니다~",
    "title": "미팅일 당일 안내문자"
  },
  {
    "color": "#BF5AF2",
    "text": "안녕하세요 인사이트부동산입니다. \n오늘 ~시에 저희 사무실에서 계약서작성 있으십니다.\n본인 신분증과 도장(도장 없으시면 사인하셔도 됩니다.) 지참하시고 내방해주시면 됩니다.",
    "title": "계약서작성일안내"
  },
  {
    "color": "#FF453A",
    "text": "dudgus1979!",
    "title": "영현1979!"
  },
  {
    "color": "#32D74B",
    "text": "계약서작성에 필요한 인적사항 부탁드립니다.\n1.성함\n2.주소(현재 거주중인 주소 적어주시면 됩니다.)\n3.주민번호(계약서에 들어가는 내용이라 뒷자리까지 모두 부탁드립니다.)\n4.전화번호",
    "title": "인적사항요청"
  },
  {
    "color": "#32D74B",
    "text": "안녕하세요 저는 약속장소에 도착했습니다. 도착하시면 연락주세요~",
    "title": "미팅장소 도착문의"
  },
  {
    "color": "#32D74B",
    "text": "방 잘 보고 나왔습니다. 불 끄고 문 잘 잠그고 나왔습니다. 감사합니다.",
    "title": "방을 본 후 물건지 부동산에 보낼 문자"
  },
  null,
  {
    "color": "#32D74B",
    "text": "인사이트부동산 중개수수료: 원(부가세포함금액)\n카카오뱅크(최영현) 3333-33-9292435 로 입금해 주시면 됩니다.",
    "title": "중개수수료 안내"
  },
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  {
    "color": "#FF9F0A",
    "text": "마곡역 전용10평 수익률 좋은 임대 맞춰진 상가",
    "title": "상가 매매광고 매물특징"
  },
  {
    "color": "#FF9F0A",
    "text": "📞상담문의•즉시연결\n➡️ 010-2019-2463 최영현 대표공인중개사 \n\n✨인사이트부동산 공인중개사 사무소 / 상가 사무실 전문공인중개사\n마곡의 상권데이터와 풍부한 중개경험을 기반으로 업종별 최적지 추천부터 렌트프리.권리금 협의까지 전문적으로 조율해 드립니다. \n\n✅임대조건 \n• 보증금:  만원\n• 월차임:  만원\n• 전용면적:\n• 입주시기:즉시입주,협의가능\n• 관리비:전용평당 약1.5만원(수도 전기등 공과금은 사용량에 따라 부과됨)\n• 주차1대 무료 방문객 앱할인\n• 권리금:없음 (또는 문의주시면 친절히 설명드리겠습니다.)\n\n✅매물설명\n\n• 입지:지하철역 도보 ~분\n• 인테리어여부:\n• 채광,뷰 좋은지 여부 \n• 원상복구 등 현재 상태에 대한 설명 \n• 화장실: 각층별 남녀 분리된 화장실 있음 \n\n■ 이 매물은 문의가 많은 인기 매물입니다.\n■ 부담갖지 마시고 연락주세요 친절히 상담해드립니다. \n■ 그외 광고되지 않은 매물 조건 문의주시면 맞춤서비스로 중개해 드리겠습니다. \n■ 임대조건 공사기간 렌트프리 권리금 업종 등 조건 최선을 다해 협의해 드립니다.",
    "title": "상가 매매광고 상세설명"
  },
  null,
  null,
  {
    "color": "#0A84FF",
    "text": "",
    "title": "오피스텔 임대광고"
  },
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
];
  let clipboards = [...INITIAL_CLIPBOARDS];
  let selectedClipboardIndex = null;
  let clipboardSearchQuery = ''; // [FIX] Move declaration here

  const clipboardGrid = document.getElementById('clipboardGrid');
  const btnClipboardEdit = document.getElementById('btnClipboardEdit');
  const btnClipboardDelete = document.getElementById('btnClipboardDelete');
  
  const clipboardEditModal = document.getElementById('clipboardEditModal');
  const btnCancelClipboardEdit = document.getElementById('btnCancelClipboardEdit');
  const btnSaveClipboard = document.getElementById('btnSaveClipboard');
  
  const clipboardViewModal = document.getElementById('clipboardViewModal');
  const btnClipboardViewCopy = document.getElementById('btnClipboardViewCopy');
  const btnClipboardViewEdit = document.getElementById('btnClipboardViewEdit');
  const btnClipboardViewDelete = document.getElementById('btnClipboardViewDelete');
  const btnClipboardViewClose = document.getElementById('btnClipboardViewClose');
  const clipboardViewTitle = document.getElementById('clipboardViewTitle');
  const clipboardViewText = document.getElementById('clipboardViewText');
  const clipboardSmsPhone = document.getElementById('clipboardSmsPhone');
  const btnClearSmsPhone = document.getElementById('btnClipboardSmsClear') || document.getElementById('btnClearSmsPhone');
  const btnClipboardSms = document.getElementById('btnClipboardSms');

  const cbTitleInput = document.getElementById('clipboardTitle');
  const cbTextInput = document.getElementById('clipboardText');
  const cbColorSwatches = document.querySelectorAll('.clipboard-color-swatch');
  let selectedCbColor = '#0A84FF';

  storage.get(['clipboards'], (result) => {
    if (result.clipboards && Array.isArray(result.clipboards)) {
      clipboards = result.clipboards;
      while (clipboards.length < GRID_SIZE) clipboards.push(null);
      if (clipboards.length > GRID_SIZE) clipboards = clipboards.slice(0, GRID_SIZE);
    } else {
      storage.set({ clipboards: clipboards });
    }
    renderClipboards();
  });

  function saveClipboards() {
    storage.set({ clipboards: clipboards });
  }

  const clipboardSearchInput = document.getElementById('clipboardSearch');
  const clearClipboardSearch = document.getElementById('clearClipboardSearch');
  if (clipboardSearchInput) {
    clipboardSearchInput.addEventListener('input', (e) => {
      clipboardSearchQuery = e.target.value.toLowerCase().trim();
      if (e.target.value.length > 0) clearClipboardSearch.classList.add('visible');
      else clearClipboardSearch.classList.remove('visible');
      renderClipboards();
    });
    if (clearClipboardSearch) {
      clearClipboardSearch.addEventListener('click', () => {
        clipboardSearchInput.value = '';
        clipboardSearchInput.dispatchEvent(new Event('input'));
        clipboardSearchInput.focus();
      });
    }

    clipboardSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const firstItem = clipboardGrid.querySelector('.bookmark-item');
        if (firstItem) {
          firstItem.focus();
          e.preventDefault();
        }
      }
    });
  }

  function renderClipboards() {
    clipboardGrid.innerHTML = '';
    clipboards.forEach((cb, index) => {
      if (clipboardSearchQuery) {
        if (!cb) return;
        const titleMatch = cb.title && cb.title.toLowerCase().includes(clipboardSearchQuery);
        const textMatch = cb.text && cb.text.toLowerCase().includes(clipboardSearchQuery);
        if (!titleMatch && !textMatch) return;
      }

      const item = document.createElement('div');
      item.className = 'bookmark-item'; // Reuse styling
      item.tabIndex = 0; // Make focusable
      if (index === selectedClipboardIndex) {
        item.classList.add('selected');
      }

      if (cb) {
        item.style.backgroundColor = cb.color || '#0A84FF';
        const nameNode = document.createElement('div');
        nameNode.className = 'bookmark-name'; // Reuse styling
        nameNode.textContent = cb.title || '제목 없음';
        item.appendChild(nameNode);
      } else {
        const emptyIcon = document.createElement('span');
        emptyIcon.className = 'bookmark-empty-icon'; // Reuse styling
        emptyIcon.textContent = '+';
        item.appendChild(emptyIcon);
      }

      item.addEventListener('click', () => {
        selectedClipboardIndex = index;
        renderClipboards();
        updateCbFooterButtons();
        
        // Execute main function on single click
        if (cb) {
          openClipboardViewModal(index);
        }
      });

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        selectedClipboardIndex = index;
        renderClipboards();
        updateCbFooterButtons();
        btnClipboardEdit.click();
      });

      // Handle Enter Key to open view modal or selection
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          item.click();
          e.preventDefault();
        }
      });

      // Drag and Drop
      item.setAttribute('draggable', 'true');
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
        item.style.opacity = '0.4';
      });
      item.addEventListener('dragend', () => {
        item.style.opacity = '1';
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      item.addEventListener('dragenter', (e) => {
        e.preventDefault();
        item.classList.add('drag-over');
      });
      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });
      item.addEventListener('drop', (e) => {
        e.stopPropagation();
        item.classList.remove('drag-over');
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (!isNaN(fromIndex) && fromIndex !== index) {
          const temp = clipboards[fromIndex];
          clipboards[fromIndex] = clipboards[index];
          clipboards[index] = temp;
          
          if (selectedClipboardIndex === fromIndex) selectedClipboardIndex = index;
          else if (selectedClipboardIndex === index) selectedClipboardIndex = fromIndex;
          
          saveClipboards();
          renderClipboards();
          updateCbFooterButtons();
        }
      });

      clipboardGrid.appendChild(item);
    });
  }

  function updateCbFooterButtons() {
    if (selectedClipboardIndex !== null) {
      btnClipboardEdit.disabled = false;
      const cb = clipboards[selectedClipboardIndex];
      btnClipboardDelete.disabled = !cb;
    } else {
      btnClipboardEdit.disabled = true;
      btnClipboardDelete.disabled = true;
    }
  }

  function openCbEditModal(index) {
    const cb = clipboards[index];
    if (cb) {
      cbTitleInput.value = cb.title || '';
      cbTextInput.value = cb.text || '';
      selectedCbColor = cb.color || '#0A84FF';
    } else {
      cbTitleInput.value = '';
      cbTextInput.value = '';
      selectedCbColor = '#0A84FF';
    }
    updateCbSwatches();
    clipboardViewModal.classList.add('hidden');
    clipboardEditModal.classList.remove('hidden');
  }

  btnClipboardEdit.addEventListener('click', () => {
    if (selectedClipboardIndex === null) return;
    openCbEditModal(selectedClipboardIndex);
  });

  btnCancelClipboardEdit.addEventListener('click', () => {
    clipboardEditModal.classList.add('hidden');
  });

  btnSaveClipboard.addEventListener('click', () => {
    clipboards[selectedClipboardIndex] = {
      title: cbTitleInput.value.trim(),
      text: cbTextInput.value.trim(),
      color: selectedCbColor
    };
    saveClipboards();
    renderClipboards();
    updateCbFooterButtons();
    clipboardEditModal.classList.add('hidden');
  });

  cbColorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      selectedCbColor = swatch.getAttribute('data-color');
      updateCbSwatches();
    });
  });

  function updateCbSwatches() {
    cbColorSwatches.forEach(swatch => {
      if (swatch.getAttribute('data-color') === selectedCbColor) {
        swatch.classList.add('active');
      } else {
        swatch.classList.remove('active');
      }
    });
  }

  // Delete from footer logic
  btnClipboardDelete.addEventListener('click', () => {
    if (selectedClipboardIndex === null || !clipboards[selectedClipboardIndex]) return;
    deleteMode = 'clipboard';
    deleteModal.classList.remove('hidden');
  });

  function openClipboardViewModal(index) {
    const cb = clipboards[index];
    if (!cb) return;
    selectedClipboardIndex = index;
    clipboardViewTitle.textContent = cb.title || '제목 없음';
    clipboardViewText.value = cb.text || '';
    clipboardViewModal.classList.remove('hidden');
  }

  const btnClipboardViewHeaderClose = document.getElementById('btnClipboardViewHeaderClose');

  btnClipboardViewHeaderClose.addEventListener('click', () => {
    clipboardViewModal.classList.add('hidden');
  });

  btnClipboardViewClose.addEventListener('click', () => {
    clipboardViewModal.classList.add('hidden');
  });

  btnClipboardViewCopy.addEventListener('click', async () => {
    const cb = clipboards[selectedClipboardIndex];
    if (cb && cb.text) {
        try {
            await navigator.clipboard.writeText(cb.text);
            const originalText = btnClipboardViewCopy.textContent;
            btnClipboardViewCopy.textContent = '복사 완료!';
            setTimeout(() => {
                btnClipboardViewCopy.textContent = originalText;
            }, 1500);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    }
  });

  btnClipboardViewEdit.addEventListener('click', () => {
    openCbEditModal(selectedClipboardIndex);
  });

  btnClipboardViewDelete.addEventListener('click', () => {
    // clipboardViewModal.classList.add('hidden'); // Keep detail modal visible in background
    deleteMode = 'clipboard';
    deleteModal.classList.remove('hidden');
  });

  // SMS Functionality
  if (btnClipboardSms) {
    // Load last used phone number
    storage.get(['lastSmsPhone'], (result) => {
      if (result.lastSmsPhone) {
        clipboardSmsPhone.value = result.lastSmsPhone;
        btnClearSmsPhone.style.display = 'flex';
      }
    });

    btnClipboardSms.addEventListener('click', () => {
      const phone = clipboardSmsPhone.value.trim();
      const content = clipboardViewText.value;
      
      if (!phone) {
        alert('전화번호를 입력해주세요.');
        clipboardSmsPhone.focus();
        return;
      }
      
      // Save raw input for next time
      storage.set({ lastSmsPhone: phone });
      
      // Normalize phone numbers for group SMS (comma-separated)
      // Replace spaces or semicolons with commas, then clean up duplicate commas
      const normalizedPhone = phone.replace(/[\s;]+/g, ',').replace(/,+/g, ',');
      
      // Construct SMS URI
      const encodedMsg = encodeURIComponent(content);
      const smsUri = `sms:${normalizedPhone}?body=${encodedMsg}`;
      
      // Try to open the URI
      window.open(smsUri, '_blank');
    });

    // Toggle clear button visibility
    clipboardSmsPhone.addEventListener('input', () => {
      btnClearSmsPhone.style.display = clipboardSmsPhone.value ? 'flex' : 'none';
    });

    // Clear and focus
    btnClearSmsPhone.addEventListener('click', () => {
      clipboardSmsPhone.value = '';
      btnClearSmsPhone.style.display = 'none';
      clipboardSmsPhone.focus();
    });
  }

  /* =========================================
     Address Logic
     ========================================= */

  function loadAddressesFromCSV() {
    fetch('건물정보_20260410.csv')
      .then(response => response.arrayBuffer())
      .then(buffer => {
        let decoder = new TextDecoder('euc-kr');
        let text = decoder.decode(buffer);
        if (text.includes('')) { // if error characters found or just standard checking
            decoder = new TextDecoder('utf-8');
            text = decoder.decode(buffer);
        }
        
        const parsed = parseCSV(text);
        addressData = [];
        for (let i = 1; i < parsed.length; i++) {
          const row = parsed[i];
          if (row.length < 2 || (!row[0] && !row[1])) continue; 
          addressData.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            name: row[0] || '',
            address: row[1] || '',
            completion: row[2] || '',
            officeNum: row[3] || '',
            officeLoc: row[4] || '',
            entrance: row[5] || '',
            parking: row[6] || '',
            room: row[7] || '',
            firedoor: row[8] || '',
            facilities: row[9] || '',
            memo: row[10] || ''
          });
        }
        storage.set({ addresses: addressData });
        renderAddresses();
      })
      .catch(err => console.error("CSV Load Error:", err));
  }

  function parseCSV(str) {
      const arr = [];
      let quote = false;
      let row = 0, col = 0;
      for (let c = 0; c < str.length; c++) {
          let cc = str[c], nc = str[c+1];
          arr[row] = arr[row] || [];
          arr[row][col] = arr[row][col] || '';
          if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
          if (cc == '"') { quote = !quote; continue; }
          if (cc == ',' && !quote) { ++col; continue; }
          if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
          if (cc == '\n' && !quote) { ++row; col = 0; continue; }
          if (cc == '\r' && !quote) { ++row; col = 0; continue; }
          arr[row][col] += cc;
      }
      return arr;
  }

  function renderAddresses() {
    const container = document.getElementById('addressList');
    if(!container) return;
    container.innerHTML = '';
    const query = addressSearchQuery.toLowerCase().trim();
    
    addressData.forEach((addr) => {
      if (query) {
        const matchName = addr.name.toLowerCase().includes(query);
        const matchAddr = addr.address.toLowerCase().includes(query);
        if (!matchName && !matchAddr) return;
      }
      
      const div = document.createElement('div');
      div.className = 'address-item';
      div.tabIndex = 0; // Make focusable
      
      const headerEl = document.createElement('div');
      headerEl.style.display = 'flex';
      headerEl.style.justifyContent = 'space-between';
      headerEl.style.alignItems = 'flex-start';
      headerEl.style.width = '100%';
      
      const titleWrapper = document.createElement('div');
      titleWrapper.className = 'address-item-header';
      titleWrapper.style.flex = '1';
      
      const nameEl = document.createElement('span');
      nameEl.className = 'address-item-name';
      nameEl.textContent = addr.name || '이름 없음';
      
      const addrEl = document.createElement('span');
      addrEl.className = 'address-item-addr-inline';
      addrEl.textContent = addr.address ? ` ${addr.address}` : '';
      
      titleWrapper.appendChild(nameEl);
      titleWrapper.appendChild(addrEl);
      
      const mapBtn = document.createElement('button');
      mapBtn.className = 'map-btn';
      mapBtn.innerHTML = '📍 지도';
      mapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const searchQuery = addr.address || addr.name;
        if (searchQuery) {
          window.open(`https://map.kakao.com/link/search/${encodeURIComponent(searchQuery)}`, '_blank');
        }
      });
      
      headerEl.appendChild(titleWrapper);
      headerEl.appendChild(mapBtn);
      
      const infoEl = document.createElement('div');
      infoEl.className = 'address-item-info';
      
      const officeStr = addr.officeNum ? `관리실: ${addr.officeNum}` : '';
      const completionStr = addr.completion ? `준공: ${addr.completion}` : '';
      const infoText = [officeStr, completionStr].filter(Boolean).join(' | ');
      infoEl.textContent = infoText || '-';
      
      div.appendChild(headerEl);
      div.appendChild(infoEl);
      
      div.addEventListener('click', () => {
        openAddressViewModal(addr.id);
      });
      
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          openAddressViewModal(addr.id);
          e.preventDefault();
        }
      });
      
      container.appendChild(div);
    });
  }

  function openAddressViewModal(id) {
    selectedAddressId = id;
    const addr = addressData.find(a => a.id === id);
    if (!addr) return;
    
    document.getElementById('addrViewName').textContent = addr.name || '건물명 없음';
    document.getElementById('addrViewAddress').textContent = addr.address || '-';
    document.getElementById('addrViewCompletion').textContent = addr.completion || '-';
    document.getElementById('addrViewTotalFloors').textContent = addr.totalFloors || '-';
    document.getElementById('addrViewOfficeNum').textContent = addr.officeNum || '-';
    document.getElementById('addrViewOfficeLoc').textContent = addr.officeLoc || '-';
    document.getElementById('addrViewEntrance').textContent = addr.entrance || '-';
    document.getElementById('addrViewParking').textContent = addr.parking || '-';
    document.getElementById('addrViewRoom').textContent = addr.room || '-';
    document.getElementById('addrViewFiredoor').textContent = addr.firedoor || '-';
    document.getElementById('addrViewFacilities').textContent = addr.facilities || '-';
    document.getElementById('addrViewMemo').textContent = addr.memo || '-';
    
    document.getElementById('addressViewModal').classList.remove('hidden');
  }

  function closeAddressViewModal() {
    document.getElementById('addressViewModal').classList.add('hidden');
  }

  function openAddressEditModal(isNew = false) {
    currentEditType = isNew ? 'new' : 'edit';
    
    if (isNew) {
      selectedAddressId = null;
      document.getElementById('addrEditModalTitle').textContent = "새 건물 추가";
      document.getElementById('addrEditName').value = "";
      document.getElementById('addrEditAddress').value = "";
      document.getElementById('addrEditCompletion').value = "";
      document.getElementById('addrEditTotalFloors').value = "";
      document.getElementById('addrEditOfficeNum').value = "";
      document.getElementById('addrEditOfficeLoc').value = "";
      document.getElementById('addrEditEntrance').value = "";
      document.getElementById('addrEditParking').value = "";
      document.getElementById('addrEditRoom').value = "";
      document.getElementById('addrEditFiredoor').value = "";
      document.getElementById('addrEditFacilities').value = "";
      document.getElementById('addrEditMemo').value = "";
    } else {
      document.getElementById('addrEditModalTitle').textContent = "건물 정보 수정";
      const addr = addressData.find(a => a.id === selectedAddressId);
      if (!addr) return;
      document.getElementById('addrEditName').value = addr.name || "";
      document.getElementById('addrEditAddress').value = addr.address || "";
      document.getElementById('addrEditCompletion').value = addr.completion || "";
      document.getElementById('addrEditTotalFloors').value = addr.totalFloors || "";
      document.getElementById('addrEditOfficeNum').value = addr.officeNum || "";
      document.getElementById('addrEditOfficeLoc').value = addr.officeLoc || "";
      document.getElementById('addrEditEntrance').value = addr.entrance || "";
      document.getElementById('addrEditParking').value = addr.parking || "";
      document.getElementById('addrEditRoom').value = addr.room || "";
      document.getElementById('addrEditFiredoor').value = addr.firedoor || "";
      document.getElementById('addrEditFacilities').value = addr.facilities || "";
      document.getElementById('addrEditMemo').value = addr.memo || "";
    }
    
    document.getElementById('addressViewModal').classList.add('hidden');
    document.getElementById('addressEditModal').classList.remove('hidden');
  }

  function closeAddressEditModal() {
    document.getElementById('addressEditModal').classList.add('hidden');
  }

  function saveAddress() {
    const newAddr = {
      id: selectedAddressId || (Date.now().toString() + Math.random().toString(36).substr(2, 5)),
      name: document.getElementById('addrEditName').value,
      address: document.getElementById('addrEditAddress').value,
      completion: document.getElementById('addrEditCompletion').value,
      totalFloors: document.getElementById('addrEditTotalFloors').value,
      officeNum: document.getElementById('addrEditOfficeNum').value,
      officeLoc: document.getElementById('addrEditOfficeLoc').value,
      entrance: document.getElementById('addrEditEntrance').value,
      parking: document.getElementById('addrEditParking').value,
      room: document.getElementById('addrEditRoom').value,
      firedoor: document.getElementById('addrEditFiredoor').value,
      facilities: document.getElementById('addrEditFacilities').value,
      memo: document.getElementById('addrEditMemo').value
    };
    
    if (currentEditType === 'new') {
      addressData.unshift(newAddr);
    } else {
      const idx = addressData.findIndex(a => a.id === selectedAddressId);
      if(idx > -1) addressData[idx] = newAddr;
    }
    
    storage.set({ addresses: addressData });
    renderAddresses();
    closeAddressEditModal();
    
    if (currentEditType === 'edit') {
      openAddressViewModal(newAddr.id);
    } // if new, just let them see the list
  }

  // Load Addresses on start
  const INITIAL_ADDRESSES = [{"address":"마곡동 791-5","completion":"","entrance":"","facilities":"","firedoor":"","id":"17768460687801gd7d","memo":"","name":"파인스퀘어3차","officeLoc":"","officeNum":"","parking":"","room":"","totalFloors":""},{"address":"마곡동 791-9","completion":"","entrance":"","facilities":"","firedoor":"","id":"1776845906767r1f4q","memo":"파인스퀘어3차에 관리실이 있음","name":"파인스퀘어2차","officeLoc":"","officeNum":"","parking":"","room":"","totalFloors":""},{"address":"마곡동 798-3","completion":"2019.05.02","entrance":"","facilities":"","firedoor":"","id":"1776672288978fwazr","memo":"","name":"747타워","officeLoc":"","officeNum":"02-2662-0747","parking":"","room":"","totalFloors":""},{"address":"마곡동 774-1","completion":"2019.02.21","entrance":"","facilities":"","firedoor":"","id":"1776672288978w9400","memo":"","name":"GMG엘스타","officeLoc":"","officeNum":"02-3664-1860","parking":"","room":""},{"address":"마곡동 798-16","completion":"2019.08.23","entrance":"","facilities":"","firedoor":"","id":"1776672288978ndgkx","memo":"","name":"M밸리 W타워4차","officeLoc":"","officeNum":"02-2661-7736\n3차는 02-2667-0283","parking":"","room":""},{"address":"마곡동 774","completion":"2016.07.08","entrance":"","facilities":"","firedoor":"","id":"1776672288978s4wx9","memo":"","name":"SH빌딩","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"화곡동 1107","completion":"2022.10.14","entrance":"","facilities":"","firedoor":"","id":"1776672288978l798k","memo":"","name":"VIP오피스텔","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"","completion":"2023. 4. 20","entrance":"","facilities":"","firedoor":"","id":"1776672288978n5rr4","memo":"","name":"가양6단지 아파트","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 1479-2","completion":"2005. 1. 21","entrance":"","facilities":"","firedoor":"","id":"1776672288978idugb","memo":"","name":"가양오피스텔","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 1498","completion":"2013. 6. 7","entrance":"","facilities":"","firedoor":"","id":"1776672288978rwi8j","memo":"","name":"강서한강자이타워","officeLoc":"","officeNum":"02-6968-5800","parking":"","room":""},{"address":"","completion":"2025. 9. 22","entrance":"","facilities":"","firedoor":"","id":"17766722889783et15","memo":"","name":"강서힐스테이트","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 793-2","completion":"2015.11.20","entrance":"종 2480","facilities":"","firedoor":"","id":"177667228897891x88","memo":"","name":"갤럭시","officeLoc":"","officeNum":"02-3661-3335","parking":"","room":""},{"address":"마곡동 5-1","completion":"2017.06.13","entrance":"9398#","facilities":"","firedoor":"","id":"1776672288978z93my","memo":"","name":"갤럭시마곡2","officeLoc":"","officeNum":"02-3665-8881","parking":"","room":""},{"address":"가양동 248-2","completion":"2015. 10. 14.","entrance":"","facilities":"","firedoor":"","id":"17766722889785zgmn","memo":"","name":"갤럭시빌","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 797-6","completion":"2018.01.12","entrance":"","facilities":"","firedoor":"","id":"17766722889783e2pn","memo":"","name":"건와빌딩","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"등촌동 820","completion":"2017.08.02","entrance":"#0636#","facilities":"","firedoor":"","id":"1776672288978ytel5","memo":"","name":"경동미르웰양천향교 복층","officeLoc":"","officeNum":"02-6341-3290","parking":"","room":""},{"address":"등촌동 685","completion":"2020.02.20","entrance":"9999","facilities":"","firedoor":"","id":"1776672288978frj8n","memo":"","name":"경동미르웰양천향교2차","officeLoc":"","officeNum":"02-2659-9768","parking":"","room":""},{"address":"마곡동 795-6","completion":"2017.02.24","entrance":"","facilities":"","firedoor":"","id":"1776672288978zfi4j","memo":"","name":"골든타워","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"방화동 598-148","completion":"","entrance":"종0422","facilities":"","firedoor":"","id":"1776672288978j06va","memo":"","name":"골든팰리스","officeLoc":"","officeNum":"070-7808-0049\n010-2069-6359","parking":"","room":""},{"address":"A마곡동 799-7 B마곡동 728-196","completion":"2019.04.18","entrance":"","facilities":"","firedoor":"유리문","id":"1776672288978clh7w","memo":"지하1층~4층 주차장 전기차 충전소는 지하3층 5대","name":"그랑트윈A동B동","officeLoc":" 지하1층","officeNum":"A동 02-2038-3535\nB동 02-2038-3636","parking":"2.3미터","room":""},{"address":"","completion":"2023. 8. 9","entrance":"","facilities":"","firedoor":"","id":"1776672288978oabgs","memo":"","name":"금호어울림","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"","completion":"2024. 7. 18","entrance":"","facilities":"","firedoor":"","id":"1776672288978ywf7v","memo":"","name":"기타물건","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 800","completion":"2019.09.02","entrance":"","facilities":"","firedoor":"","id":"17766722889786vwgq","memo":"","name":"나인스퀘어","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"","completion":"2023. 8. 15","entrance":"","facilities":"","firedoor":"","id":"1776672288978putv4","memo":"","name":"넥스트파크뷰","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 9","completion":"2023. 12. 20","entrance":"","facilities":"","firedoor":"","id":"1776672288978rfnpq","memo":"","name":"놀라움지산","officeLoc":"","officeNum":"문의 1811-1777","parking":"","room":""},{"address":"등촌동 683-1","completion":"2013.12.27.","entrance":"","facilities":"","firedoor":"","id":"17766722889785co91","memo":"","name":"뉴스토리","officeLoc":"","officeNum":"소장(관리비정산) 010-9101-8547","parking":"","room":""},{"address":"공항동665-16","completion":"2023. 8. 15","entrance":"","facilities":"","firedoor":"","id":"1776672288978c8lqu","memo":"","name":"늘푸른빌라 (공항동665-16)","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 250-2","completion":"2022.10.19.","entrance":"88","facilities":"","firedoor":"","id":"1776672288978ayoab","memo":"","name":"다솔씨티하임","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"내발산동 715-5","completion":"2025. 6. 30","entrance":"","facilities":"","firedoor":"","id":"17766722889783z75c","memo":"","name":"다울아파트","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"","completion":"2023. 8. 11","entrance":"","facilities":"","firedoor":"","id":"1776672288978ohija","memo":"","name":"대룡2차","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"","completion":"2025. 7. 15","entrance":"","facilities":"","firedoor":"","id":"1776672288978cebjx","memo":"","name":"대룡드림타워1차","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"","completion":"2023. 4. 20","entrance":"","facilities":"","firedoor":"","id":"1776672288978ubvno","memo":"","name":"대림밸리","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 784-6","completion":"2015.05.08","entrance":"10#7330#","facilities":"","firedoor":"","id":"1776672288978yl1fe","memo":"","name":"대명21","officeLoc":"","officeNum":"02-3663-7866","parking":"","room":""},{"address":"마곡동 776-2","completion":"2017.01.04","entrance":"열쇠 1281 종","facilities":"","firedoor":"","id":"1776672288978f1us5","memo":"","name":"대방1차","officeLoc":"","officeNum":"02-3663-7752","parking":"","room":""},{"address":"마곡동 776","completion":"2019.03.12","entrance":"열쇠7889종","facilities":"","firedoor":"","id":"1776672288978we62p","memo":"","name":"대방2차","officeLoc":"","officeNum":"02-3662-3300","parking":"","room":""},{"address":"등촌동 365-69","completion":"2019. 6. 7","entrance":"","facilities":"","firedoor":"","id":"1776672288978ozmlc","memo":"","name":"더봄힐","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"방화동 620-3","completion":"","entrance":"","facilities":"","firedoor":"","id":"1776672288978ffhz4","memo":"","name":"더스카이2","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"등촌동 639-6","completion":"2023. 2. 9","entrance":"","facilities":"","firedoor":"","id":"17766722889788uxrw","memo":"","name":"더퍼스트가양 오피스텔","officeLoc":"","officeNum":"010-9951-7828","parking":"","room":""},{"address":"화곡동 1026-2","completion":"","entrance":"","facilities":"","firedoor":"","id":"17766722889785jds2","memo":"","name":"덕현제왕타워","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"","completion":"","entrance":"","facilities":"세미나실 제공 대여비용 저렴 관리실통한 예약제 운영","firedoor":"","id":"1776672288978ecvvn","memo":"","name":"데시앙플렉스","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 99-2","completion":"2019. 4. 3","entrance":"","facilities":"","firedoor":"","id":"1776672288978imrz5","memo":"","name":"델타빌딩","officeLoc":"","officeNum":"02-2659-2228관리실장 김동균 010-6332-0638대표 김정수 010-5260-9030","parking":"","room":""},{"address":"가양동 1459","completion":"1993. 6. 17","entrance":"","facilities":"","firedoor":"","id":"1776672288978maty0","memo":"","name":"동신대아아파트","officeLoc":"","officeNum":"02-2659-6771","parking":"","room":""},{"address":"마곡동 768-2","completion":"2017.01.20","entrance":"","facilities":"","firedoor":"유리문","id":"17766722889789sydc","memo":"","name":"동익 드 미라벨","officeLoc":"","officeNum":"","parking":"2.3미터","room":""},{"address":"마곡동 759-1","completion":"2017.11.08","entrance":"","facilities":"","firedoor":"","id":"1776672288978wlmsl","memo":"","name":"두산 더 랜드타워","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 757","completion":"2017.11.08","entrance":"","facilities":"","firedoor":"","id":"1776672288978176ks","memo":"","name":"두산더랜드파크","officeLoc":"","officeNum":"02-6980-8810","parking":"","room":""},{"address":"등촌동 641-2","completion":"2020.03.27","entrance":"","facilities":"","firedoor":"","id":"1776672288978opt35","memo":"","name":"등촌크라운팰리스2차","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"등촌동 633-21","completion":"2016. 11. 23","entrance":"","facilities":"","firedoor":"","id":"17766722889788rxvb","memo":"","name":"등촌투웨니퍼스트3차","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 239-1","completion":"2006. 6. 28","entrance":"","facilities":"","firedoor":"","id":"1776672288978k1qu7","memo":"","name":"디아이빌","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 782","completion":"2020.04.17.","entrance":"","facilities":"","firedoor":"","id":"1776672288978tcbpk","memo":"","name":"디엠프라자","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 774-5","completion":"2016.09.09","entrance":"","facilities":"","firedoor":"","id":"1776672288978cdfcp","memo":"","name":"랑데르 2차","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 758-1","completion":"2017.02.07","entrance":"N동 : 공동현관 종2051","facilities":"","firedoor":"","id":"1776672288978u6zck","memo":"","name":"럭스나인L동","officeLoc":"","officeNum":"N동 02-2668-6001(070-4907-5840)","parking":"","room":""},{"address":"마곡동 758-4","completion":"2017.02.07","entrance":"N동 : 공동현관 종2051","facilities":"","firedoor":"","id":"1776672288978rn64j","memo":"","name":"럭스나인N동","officeLoc":"","officeNum":"엘동 02-3662-5030","parking":"","room":""},{"address":"가양동 239-18","completion":"2024. 12. 24","entrance":"","facilities":"","firedoor":"","id":"1776672288978qeqe9","memo":"","name":"럭키빌","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"","completion":"","entrance":"8282 화장실 9000","facilities":"","firedoor":"","id":"1776672288978ct5f6","memo":"","name":"레인보우","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 799-1","completion":"2018.10.17","entrance":"","facilities":"","firedoor":"","id":"1776672288978zi5ho","memo":"지하2층 분리수거장 지하4층 전기차충전소 4면","name":"로뎀타워","officeLoc":"","officeNum":"02-2039-9114","parking":"2.3미터","room":""},{"address":"마곡동 760-2","completion":"2016.12.06","entrance":"","facilities":"","firedoor":"","id":"1776672288978wd67p","memo":"","name":"롯데캐슬","officeLoc":"","officeNum":"02-3665-9085","parking":"","room":""},{"address":"마곡동 767-4","completion":"2024. 8. 28","entrance":"공동현관 1254 + 확인","facilities":"","firedoor":"","id":"1776672288978fowgv","memo":"풀퍼니쉬드 인테리어 (인덕션 양문형냉장고 드럼세탁기 건조기 빌트인김치냉장고 전기오븐 빌트인정수기 음식물처리기 욕실 사계절 온풍기)\n단지내 커뮤니티시설:피트니스센터 골프연습장 카페테리아 키즈카페 스터디카페 등\n지하6층 ~지상 15층 총5개동\n876세대 총주차 1426대 (오피스텔 956대 1.09:1)\n\n□ 매물정보\n◎ 교통 : 9호선급행 공항철도 5호선(마곡역)\n마곡역과 마곡나루역은 지하공공보행통로로 연결됩니다.\n\n◎ 편의시설 : 단지내커뮤니티시설\n(피트니스, 실내골프연습장,다이닝카페, 맘스라운지, 스터디룸, 와인\n라운지)\n단지내앞 근린공원및 서울식물원중앙공원,\n트레이더스, 원그로브, 마곡코엑스, LG아트센터등\n\n◎ 실내 옵션및 인테리어\n* 풀옵션\n(빌트인양문형냉장고밀 김치냉장고, 렌지후드, 3구인덕션, 빌트인세\n탁기,건조기.\n빌트인 전기오븐, 빌트인 정수기, 음식물처리기 등등)\n\n* 욕실 : 사계절냉온풍기, 욕실1은 욕조도 있어요.\n\n* 기타 :\n> 이탈리아산 아트월 및 원목마루, 중문 ,고효율LED 조명 등\n\n₩ 롯데캐슬 르웨스트 매매및 임대문의 365일 상담환영합니다.\n고객의 소중한 자산을 연구하고 고객의 행복한 미래를 디자인합니다.\n사진은 실제 호수의 사진입니다 ^^","name":"롯데캐슬르웨스트","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"등촌동 630-4","completion":"2021. 10. 29","entrance":"","facilities":"","firedoor":"","id":"1776672288978w8ly0","memo":"","name":"루나클래식 (101동,102동)","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"등촌동 725","completion":"2021.03.12","entrance":"","facilities":"","firedoor":"","id":"1776672288978iuybl","memo":"","name":"루나플라체","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 797-12","completion":"2017.01.24","entrance":"","facilities":"","firedoor":"","id":"1776672288978nmmr3","memo":"","name":"루체브릿지","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 798-2","completion":"2019.04.18","entrance":"","facilities":"","firedoor":"","id":"1776672288978zm654","memo":"","name":"류마타워","officeLoc":"","officeNum":"02-2064-0303","parking":"","room":""},{"address":"마곡동 798-6","completion":"2019.10.11","entrance":"","facilities":"","firedoor":"","id":"1776672288978wu5ya","memo":"","name":"류마타워 2차","officeLoc":"","officeNum":"02-2064-0544","parking":"","room":""},{"address":"마곡동 793-6","completion":"2015.01.04","entrance":"#2862#","facilities":"","firedoor":"","id":"1776672288978qxf9l","memo":"","name":"르보아1차","officeLoc":"","officeNum":"02-2658-6007","parking":"","room":""},{"address":"마곡동 739-2","completion":"2015.04.30","entrance":"10#9999#","facilities":"","firedoor":"","id":"17766722889780yef1","memo":"","name":"르보아2차","officeLoc":"","officeNum":"02-2666-8376","parking":"","room":""},{"address":"마곡동 791-7","completion":"2020년 07월 31일","entrance":"","facilities":"","firedoor":"유리문","id":"1776672288978ssb8w","memo":"분리수거장 지하2층 전기차충전 지하3층 주차 75대 지하3층~지상5층","name":"리더스애비뉴","officeLoc":"지하1층","officeNum":"010-9256-7633","parking":"","room":""},{"address":"마곡동 772-5","completion":"2017.05.19","entrance":"","facilities":"","firedoor":"","id":"1776672288978zd79i","memo":"","name":"리더스퀘어","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 800-5","completion":"2018.12.14","entrance":"","facilities":"","firedoor":"","id":"1776672288978uq5ip","memo":"","name":"리더스타워","officeLoc":"","officeNum":"02-3665-7722","parking":"","room":""},{"address":"가양동 146-41","completion":"2017. 1. 9","entrance":"","facilities":"","firedoor":"","id":"17766722889785r62i","memo":"","name":"리버아트빌","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"염창동 253","completion":"2016.08.09","entrance":"","facilities":"","firedoor":"","id":"1776672288978u7u4g","memo":"","name":"링크253 도생(단지형다세대)","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 739-3","completion":"2015.01.16","entrance":"","facilities":"","firedoor":"","id":"1776672288978n2qo3","memo":"","name":"마곡 에스비타운","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 739-1","completion":"2016.04.14","entrance":"","facilities":"","firedoor":"","id":"1776672288978icimg","memo":"","name":"마곡W타워(신방화역)","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"공항동 673-10","completion":"2019.12.04.","entrance":"","facilities":"","firedoor":"","id":"1776672288978spikx","memo":"","name":"마곡대림밸리","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"공항동 19-40","completion":"2019.09.17","entrance":"","facilities":"","firedoor":"","id":"1776672288978wtfrg","memo":"","name":"마곡리치빌 (다세대)","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"방화동 186-3","completion":"2023. 8. 8","entrance":"","facilities":"","firedoor":"","id":"17766722889787dva7","memo":"","name":"마곡미라클","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 1245","completion":"2024. 6. 20","entrance":"","facilities":"","firedoor":"","id":"1776672288978t9u2b","memo":"","name":"마곡스카이 비단지","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 758","completion":"2016.07.27","entrance":"#408#7564 공동#620#6551","facilities":"","firedoor":"","id":"17766722889789vd1d","memo":"","name":"마곡씨티","officeLoc":"","officeNum":"02-6203-2548","parking":"","room":""},{"address":"방화동 589-24","completion":"2019.10.16","entrance":"","facilities":"","firedoor":"","id":"1776672288978v2jgt","memo":"","name":"마곡엠타운 (도생 단지형 다세대)","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"방화동 274-2","completion":"2022.08.24.","entrance":"","facilities":"","firedoor":"","id":"1776672288978ji2vm","memo":"","name":"마곡제이엠팰리스","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"방화동 859","completion":"","entrance":"","facilities":"","firedoor":"","id":"1776672288978w1dd9","memo":"","name":"마곡청구아파트","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 275-1","completion":"2017.12.05","entrance":"1234종","facilities":"","firedoor":"","id":"17766722889784er2w","memo":"","name":"마곡파크뷰","officeLoc":"","officeNum":"010 6335 0882","parking":"","room":""},{"address":"마곡동 774-12","completion":"2017.07.14","entrance":"","facilities":"","firedoor":"","id":"17766722889788kext","memo":"","name":"마커스빌딩","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 793-7","completion":"2020.02.28","entrance":"","facilities":"","firedoor":"","id":"17766722889788hdq9","memo":"","name":"매그넘 793","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 797-9","completion":"2018.12.12","entrance":"","facilities":"","firedoor":"","id":"1776672288978rzk8x","memo":"","name":"매그넘 797","officeLoc":"","officeNum":"02-2659-7100","parking":"","room":""},{"address":"마곡동 798-9","completion":"2020.06.04","entrance":"","facilities":"","firedoor":"","id":"1776672288978hhb3h","memo":"","name":"메가타워","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 799-6","completion":"2019.08.30","entrance":"","facilities":"확인못함","firedoor":"유리문(화장실은 방화문)","id":"1776672288978vzda6","memo":"지하4층 전기차충전기 3면 있음 주차운영 나이스파크 10분 무료회차 10분당 500원","name":"메트로비즈타워","officeLoc":"지하1층","officeNum":"02-2666-9974","parking":"2.3미터","room":""},{"address":"등촌동 656-52","completion":"2013. 10. 28","entrance":"","facilities":"","firedoor":"","id":"1776672288978la49v","memo":"","name":"메트로칸","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 794","completion":"2015.12.29","entrance":"","facilities":"","firedoor":"","id":"17766722889782ume4","memo":"","name":"문영 비즈웍스","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"화곡동 1105","completion":"2022. 4. 18","entrance":"","facilities":"","firedoor":"","id":"1776672288978g126c","memo":"","name":"미래안포레","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 784","completion":"2015.05.08","entrance":"#*1234#","facilities":"","firedoor":"","id":"177667228897891qj7","memo":"","name":"미르웰1차","officeLoc":"","officeNum":"02-2658-3306","parking":"","room":""},{"address":"마곡동 784-4","completion":"2015.12.11","entrance":"#9999#","facilities":"","firedoor":"","id":"1776672288978qh6sx","memo":"","name":"미르웰플러스","officeLoc":"","officeNum":"02-3662-3290","parking":"","room":""},{"address":"마곡동 800-4","completion":"2018.03.30","entrance":"","facilities":"","firedoor":"","id":"17766722889789z70z","memo":"","name":"발산 W타워","officeLoc":"","officeNum":"070-8620-0571~2","parking":"","room":""},{"address":"마곡동 797-4","completion":"2016.05.13","entrance":"","facilities":"","firedoor":"","id":"1776672288978deazb","memo":"","name":"발산 파크프라자","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"303동 1402호","completion":"2023. 8. 17","entrance":"","facilities":"","firedoor":"","id":"1776672288978fa04u","memo":"","name":"방화3단지 청솔아파트","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"등촌동 828","completion":"2020.05.29","entrance":"종 9184","facilities":"","firedoor":"","id":"1776672288978c0jif","memo":"","name":"베스트카운티","officeLoc":"","officeNum":"02-3662-7452 관리소장 010-6269-7820","parking":"","room":""},{"address":"마곡동 784-8","completion":"2015.04.23","entrance":"","facilities":"","firedoor":"","id":"17766722889785olh7","memo":"","name":"벨리오","officeLoc":"","officeNum":"02-2658-2060","parking":"","room":""},{"address":"마곡동 429","completion":"1999.06.25.","entrance":"","facilities":"","firedoor":"","id":"1776672288978a2kf9","memo":"","name":"벽산아파트","officeLoc":"","officeNum":"02-3663-5256","parking":"","room":""},{"address":"","completion":"2025. 3. 20","entrance":"","facilities":"","firedoor":"","id":"1776672288978q3wc8","memo":"","name":"보승회관건물","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 757-3","completion":"2017.04.19","entrance":"","facilities":"","firedoor":"","id":"17766722889787j5ew","memo":"","name":"보타닉 비즈타워","officeLoc":"","officeNum":"02-2659-7727","parking":"","room":""},{"address":"마곡동 771-3","completion":"2019.01.21","entrance":"","facilities":"","firedoor":"","id":"1776672288978h0jik","memo":"","name":"보타닉 파크타워 3차","officeLoc":"","officeNum":"02-2668-8021","parking":"","room":""},{"address":"마곡동 774-2","completion":"2018.05.11","entrance":"","facilities":"","firedoor":"","id":"1776672288978vnkds","memo":"","name":"보타닉 파크타워2차","officeLoc":"","officeNum":"02-2668-8020","parking":"","room":""},{"address":"","completion":"2025. 6. 11","entrance":"","facilities":"","firedoor":"","id":"1776672288978huoin","memo":"","name":"보타닉스타뷰","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 257-1","completion":"2020.06.17","entrance":"종 7093","facilities":"","firedoor":"","id":"1776672288978bjse1","memo":"","name":"보타닉투웨니퍼스트","officeLoc":"","officeNum":"관리비정산 010-9144-1060 관리사무소 070-4789-3735 관리소장님(평일연락은여기로) 010 4039 3742","parking":"","room":""},{"address":"마곡동 759-3","completion":"2017.05.11","entrance":"","facilities":"","firedoor":"","id":"1776672288978uyz7t","memo":"","name":"보타닉파크타워1차","officeLoc":"","officeNum":"02-3663-8622","parking":"","room":""},{"address":"마곡동 771-3","completion":"2019.01.21","entrance":"","facilities":"","firedoor":"","id":"1776672288978u3qm1","memo":"","name":"보타닉파크타워3차","officeLoc":"","officeNum":"02-2668-8021","parking":"","room":""},{"address":"마곡동 777-5","completion":"2018.09.11","entrance":"","facilities":"","firedoor":"","id":"1776672288978ggmzs","memo":"","name":"보타닉파크프라자","officeLoc":"","officeNum":"02 2658 7300","parking":"","room":""},{"address":"마곡동 760","completion":"2017.02.24","entrance":"#1306","facilities":"","firedoor":"","id":"1776672288978kdsc7","memo":"","name":"보타닉푸르지오시티","officeLoc":"","officeNum":"02 2658 1306","parking":"","room":""},{"address":"마곡동 774-9","completion":"2017.07.04","entrance":"","facilities":"","firedoor":"","id":"1776672288978kx49c","memo":"","name":"사이언스타","officeLoc":"","officeNum":"02-3665-7441","parking":"","room":""},{"address":"마곡동 796-3","completion":"2016.12.27","entrance":"","facilities":"","firedoor":"","id":"177667228897877u80","memo":"","name":"사이언스타워","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 799-5","completion":"2019.05.02","entrance":"","facilities":"미확인","firedoor":"유리문","id":"17766722889789u3uj","memo":"주차할인가능 최대시간은 3시간 주차할인은 1일 1회로 제한됨(회차불가능) 무료회차시간은 20분","name":"사이언스타워 2차","officeLoc":"지하1층","officeNum":"02-2661-4999","parking":"2.3미터","room":""},{"address":"마곡동 795-5","completion":"2016.07.15","entrance":"","facilities":"","firedoor":"","id":"1776672288978u1fyj","memo":"","name":"사이언스파크뷰","officeLoc":"","officeNum":"02-6338-1700","parking":"","room":""},{"address":"가양동 184-5","completion":"2017.08.11","entrance":"","facilities":"","firedoor":"","id":"1776672288978wu609","memo":"","name":"삼성블루밍","officeLoc":"","officeNum":"02-833-0012","parking":"","room":""},{"address":"가양동 274-3","completion":"","entrance":"0501샵","facilities":"","firedoor":"","id":"1776672288978sbzgp","memo":"","name":"샬롬하우스 (마곡파크뷰 앞 다가구)","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 12-2","completion":"2020.01.08","entrance":"#4717","facilities":"","firedoor":"","id":"1776672288978q6l2c","memo":"","name":"세종보타닉1차","officeLoc":"","officeNum":"02-3665-8881","parking":"","room":""},{"address":"가양동 251-2","completion":"2020.09.02","entrance":"#4732","facilities":"","firedoor":"","id":"17766722889785a7cf","memo":"","name":"세종보타닉2차","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"내발산동 767","completion":"2025. 3. 27","entrance":"","facilities":"","firedoor":"","id":"1776672288978r8aw8","memo":"","name":"센터스퀘어 발산","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 774-3","completion":"2018.07.06","entrance":"","facilities":"","firedoor":"","id":"1776672288978owiz9","memo":"","name":"센테니아","officeLoc":"","officeNum":"02-3663-9138","parking":"","room":""},{"address":"등촌동 656-57","completion":"2020.10.15.","entrance":"","facilities":"","firedoor":"","id":"1776672288978wyj8z","memo":"","name":"센트럴시티","officeLoc":"","officeNum":"전화 02-6949-6760  팩스 02-6949-6761","parking":"","room":""},{"address":"마곡동 774-4","completion":"2016.09.01","entrance":"","facilities":"","firedoor":"","id":"1776672288978kvy0g","memo":"","name":"센트럴타워 1차","officeLoc":"","officeNum":"02-2666-7712","parking":"","room":""},{"address":"마곡동 759","completion":"2017.04.25","entrance":"","facilities":"","firedoor":"","id":"1776672288978lny2v","memo":"","name":"센트럴타워 2차","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 773-1","completion":"2016.06.03","entrance":"","facilities":"","firedoor":"","id":"17766722889783g0pp","memo":"","name":"센트럴푸르지오시티","officeLoc":"","officeNum":"02-3663-1988","parking":"","room":""},{"address":"내발산동 753","completion":"2008.02.20.","entrance":"","facilities":"","firedoor":"","id":"17766722889788pdlt","memo":"","name":"수명산파크 4단지","officeLoc":"","officeNum":"02-2667-4114","parking":"","room":""},{"address":"마곡동 784-3","completion":"2016.02.04","entrance":"종 2468","facilities":"","firedoor":"","id":"1776672288978kw6xm","memo":"","name":"스카이","officeLoc":"","officeNum":"02-2658-6688","parking":"","room":""},{"address":"마곡동 738-3","completion":"2018.10.29","entrance":"","facilities":"","firedoor":"","id":"1776672288978o0zzo","memo":"","name":"스프링파크타워","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 1501","completion":"2013.11.06","entrance":"","facilities":"","firedoor":"","id":"1776672288978al5b5","memo":"","name":"시정헌","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 274-6","completion":"2014. 9. 15","entrance":"","facilities":"","firedoor":"","id":"1776672288978u41u4","memo":"","name":"씨엘하임","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동784-13","completion":"2015.05.06","entrance":"10#9999#","facilities":"","firedoor":"","id":"1776672288978fgp5q","memo":"","name":"아르디에","officeLoc":"","officeNum":"02-3665-9269","parking":"","room":""},{"address":"등촌동 628-7","completion":"2018. 11. 16","entrance":"","facilities":"","firedoor":"","id":"17766722889789dgu4","memo":"","name":"아벨테크노","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 795-2","completion":"2016.12.29","entrance":"#9964#*\n#412*3690#","facilities":"","firedoor":"","id":"1776672288978drkui","memo":"","name":"아이파크","officeLoc":"","officeNum":"02-3665-9997","parking":"","room":""},{"address":"마곡동 783","completion":"2024. 7. 26","entrance":"","facilities":"","firedoor":"","id":"17766722889783lyed","memo":"","name":"아이파크디어반(지산)","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 237-1","completion":"2018.04.12.","entrance":"종1234","facilities":"","firedoor":"","id":"1776672288978jfgcm","memo":"","name":"아트리버빌5차 (도생 및 오피스텔)","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 757-5","completion":"2017.01.26","entrance":"","facilities":"","firedoor":"","id":"1776672288978rmsab","memo":"","name":"안강 프라이빗 1차","officeLoc":"","officeNum":"02-3662-3633","parking":"","room":""},{"address":"마곡동 757-2","completion":"2017.03.28","entrance":"","facilities":"","firedoor":"","id":"1776672288978v541y","memo":"","name":"안강 프라이빗 2차","officeLoc":"","officeNum":"02-3662-6090","parking":"","room":""},{"address":"가양동 155-8","completion":"","entrance":"","facilities":"","firedoor":"","id":"17766722889787gay6","memo":"","name":"양천골흑염소건물","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"영등포로21","completion":"","entrance":"","facilities":"","firedoor":"","id":"17766722889786tdlc","memo":"","name":"양평빌딩(양평동소재)","officeLoc":"","officeNum":"010-6775-7301","parking":"","room":""},{"address":"염창동 265-1","completion":"1995. 6. 3","entrance":"","facilities":"","firedoor":"","id":"17766722889785jl66","memo":"","name":"양화진 빌딩","officeLoc":"","officeNum":"010-3703-0316 건물주번호","parking":"","room":""},{"address":"공항동57-28","completion":"","entrance":"","facilities":"","firedoor":"","id":"1776672288978h2wwq","memo":"","name":"어울림(공항동 다가구)","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 793-3","completion":"2015.08.21.","entrance":"#8282#","facilities":"","firedoor":"","id":"1776672288978nqnjs","memo":"","name":"에비앙","officeLoc":"","officeNum":"02-2659-0192","parking":"","room":""},{"address":"마곡동 772-8","completion":"2016.05.31","entrance":"","facilities":"","firedoor":"","id":"17766722889785tbhc","memo":"","name":"에이스 프라자","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 797","completion":"2019.02.15","entrance":"","facilities":"","firedoor":"","id":"1776672288978l0fky","memo":"","name":"에이스타워","officeLoc":"","officeNum":"02-2668-6677","parking":"","room":""},{"address":"마곡동 798-5","completion":"2019.10.18","entrance":"","facilities":"","firedoor":"","id":"1776672288978ws8pa","memo":"","name":"에이스타워 2차","officeLoc":"","officeNum":"02-2664-3322","parking":"","room":""},{"address":"공항동 45-11","completion":"2023. 9. 19.","entrance":"","facilities":"","firedoor":"","id":"17766722889782nt9w","memo":"","name":"에테르힐스","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 793-4","completion":"2015.03.26","entrance":"","facilities":"","firedoor":"","id":"17766722889782b3pw","memo":"","name":"엘리안","officeLoc":"","officeNum":"02-3662-8606","parking":"","room":""},{"address":"마곡동 797-10","completion":"2017.06.28","entrance":"","facilities":"","firedoor":"","id":"1776672288978fn41n","memo":"","name":"엠 펠리체 호텔","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 798-12","completion":"2019.10.24","entrance":"","facilities":"","firedoor":"","id":"1776672288978blrt5","memo":"","name":"엠리체","officeLoc":"","officeNum":"02-2064-0780","parking":"","room":""},{"address":"마곡동 799-16","completion":"","entrance":"","facilities":"","firedoor":"","id":"17766722889786fz5c","memo":"","name":"엠밸리W타워3차(엠밸리15단지쪽)","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"","completion":"","entrance":"102동 공동현관 10#9812#","facilities":"","firedoor":"","id":"1776672288978z79bw","memo":"","name":"엠벨리1단지아파트","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 798-8","completion":"2019.09.30","entrance":"","facilities":"","firedoor":"","id":"1776672288978ua502","memo":"","name":"엠비즈타워","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 798-14","completion":"2019.10.23","entrance":"","facilities":"","firedoor":"철문","id":"17766722889785gaw9","memo":"","name":"엠시그니처","officeLoc":"5층","officeNum":"02-2666-9755","parking":"지하2층2.7미터 지하3.4층 2.3미터","room":""},{"address":"마곡동 776-4","completion":"2015.08.28","entrance":"##4088","facilities":"","firedoor":"","id":"17766722889788oomu","memo":"","name":"엠코","officeLoc":"","officeNum":"02-3662-8560","parking":"","room":""},{"address":"마곡동 801-1","completion":"2018.07.23","entrance":"","facilities":"","firedoor":"","id":"1776672288978hjb0i","memo":"","name":"열린M타워(발산역)","officeLoc":"","officeNum":"02-2661-3201","parking":"","room":""},{"address":"마곡동 798-10","completion":"2019.09.23","entrance":"","facilities":"","firedoor":"","id":"1776672288978rbeqz","memo":"","name":"열린엠타워 3차","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 795-7","completion":"2016.01.25","entrance":"","facilities":"","firedoor":"","id":"1776672288978jt795","memo":"","name":"열린프라자","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동784-11","completion":"2016.11.11","entrance":"#2030#","facilities":"","firedoor":"","id":"1776672288978y8cyb","memo":"","name":"오드1차","officeLoc":"","officeNum":"02-3662-1793","parking":"","room":""},{"address":"마곡동 784-9","completion":"2017.06.26","entrance":"#1234#","facilities":"","firedoor":"","id":"1776672288978d7j72","memo":"","name":"오드2차","officeLoc":"","officeNum":"02-3665-1799","parking":"","room":""},{"address":"염창동 240-21","completion":"","entrance":"","facilities":"","firedoor":"","id":"1776672288978rayzz","memo":"","name":"우림블루나인","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 251-7","completion":"2023. 9. 19","entrance":"","facilities":"","firedoor":"","id":"1776672288978hcsy6","memo":"","name":"우성빌라","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 794-1","completion":"2017.01.26","entrance":"","facilities":"","firedoor":"","id":"1776672288978bbidr","memo":"","name":"우성에스비타워","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 800-3","completion":"2018.04.09","entrance":"","facilities":"","firedoor":"","id":"1776672288978r19fj","memo":"","name":"우성에스비타워 2차","officeLoc":"","officeNum":"02-2664-8513","parking":"","room":""},{"address":"마곡동 798-4","completion":"2019.09.26","entrance":"","facilities":"","firedoor":"","id":"1776672288978p83kj","memo":"","name":"우성에스비타워 3차","officeLoc":"","officeNum":"02-2064-0303","parking":"","room":""},{"address":"가양동 253","completion":"2001.11.09.","entrance":"","facilities":"","firedoor":"","id":"1776672288978pe3yj","memo":"","name":"우신빌라트","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"화곡동 987-7","completion":"2021.12.28","entrance":"","facilities":"","firedoor":"","id":"1776672288978wuw4d","memo":"","name":"원타워5차","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 793","completion":"2015.11.20","entrance":"A동 303#0528# B동 309#0361#","facilities":"","firedoor":"","id":"1776672288978v8lfd","memo":"","name":"유림트윈파크","officeLoc":"","officeNum":"02-3661-0330","parking":"","room":""},{"address":"마곡동 771-4","completion":"2018.12.21","entrance":"","facilities":"","firedoor":"","id":"17766722889785fbsi","memo":"","name":"이너매스 1차","officeLoc":"","officeNum":"02-2659-3801","parking":"","room":""},{"address":"마곡동 800-15","completion":"2019.10.17","entrance":"","facilities":"","firedoor":"","id":"1776672288978lkaig","memo":"","name":"이너매스 2차","officeLoc":"","officeNum":"02-2665-8870","parking":"","room":""},{"address":"마곡동 801-7","completion":"2019.04.24","entrance":"","facilities":"","firedoor":"","id":"17766722889783dbjm","memo":"","name":"이웰 메디파크","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 797-11","completion":"2015.08.21","entrance":"","facilities":"","firedoor":"","id":"17766722889785dnlj","memo":"","name":"인터시티365","officeLoc":"","officeNum":"010-8398-7405","parking":"","room":""},{"address":"마곡동 758-2","completion":"2016.06.29","entrance":"A동 904#0419#","facilities":"","firedoor":"","id":"1776672288978xnsav","memo":"","name":"일성트루엘","officeLoc":"","officeNum":"02-2658-8185","parking":"","room":""},{"address":"가양동 184-1","completion":"1989.12.22.","entrance":"","facilities":"","firedoor":"","id":"17766722889788jgo5","memo":"","name":"장군주먹고기 (가양동 184-1)","officeLoc":"","officeNum":"임대인 010-5265-4366","parking":"","room":""},{"address":"마곡동 774-8","completion":"2017.12.01","entrance":"","facilities":"","firedoor":"","id":"1776672288978k9cec","memo":"","name":"장흥빌딩","officeLoc":"","officeNum":"02-3662-6688","parking":"","room":""},{"address":"마곡동 773-2","completion":"2015.12.07","entrance":"","facilities":"","firedoor":"","id":"1776672288978l8oah","memo":"","name":"지엠지타워","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 194-2","completion":"2014.08.05","entrance":"2580","facilities":"","firedoor":"","id":"1776672288978k9v5d","memo":"","name":"지웰","officeLoc":"","officeNum":"02-3662-6304","parking":"","room":""},{"address":"마곡동 799-4","completion":"2019.01.03","entrance":"","facilities":"","firedoor":"","id":"1776672288978x76zv","memo":"","name":"지웰타워","officeLoc":"","officeNum":"02-2667-0520","parking":"","room":""},{"address":"마곡동 796-6","completion":"2016.10.28","entrance":"","facilities":"","firedoor":"","id":"1776672288978bqqie","memo":"","name":"지투프라자","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 6-4","completion":"2018.05.10.","entrance":"종1234","facilities":"","firedoor":"","id":"1776672288978yqejn","memo":"","name":"청람아트빌","officeLoc":"","officeNum":"010-3203-7055 (2020년기준)","parking":"","room":""},{"address":"마곡동 4-2","completion":"2014.11.27.","entrance":"","facilities":"","firedoor":"","id":"1776672288978k013a","memo":"","name":"청솔씨티빌","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 800-1","completion":"2018.11.29.","entrance":"","facilities":"","firedoor":"","id":"1776672288978py1ui","memo":"","name":"퀸즈파크 11차","officeLoc":"","officeNum":"02-6373-4000","parking":"","room":""},{"address":"마곡동 799-3","completion":"2019.06.12","entrance":"","facilities":"","firedoor":"","id":"17766722889785qv1s","memo":"","name":"퀸즈파크 12차","officeLoc":"","officeNum":"02-6309-9100","parking":"","room":""},{"address":"마곡동 798-11","completion":"2019.12.24","entrance":"","facilities":"","firedoor":"","id":"1776672288978wmc82","memo":"","name":"퀸즈파크 13차","officeLoc":"","officeNum":"02-2666-9737","parking":"","room":""},{"address":"마곡동 797-1","completion":"2017.07.07","entrance":"","facilities":"","firedoor":"","id":"17766722889781xo0x","memo":"","name":"퀸즈파크 나인","officeLoc":"","officeNum":"02-6421-9000","parking":"","room":""},{"address":"마곡동 797-7","completion":"2018.03.08","entrance":"","facilities":"","firedoor":"","id":"1776672288978ql3qn","memo":"","name":"퀸즈파크 텐","officeLoc":"","officeNum":"02-6411-900","parking":"","room":""},{"address":"","completion":"2003. 12. 31","entrance":"","facilities":"","firedoor":"","id":"1776672288978pgsub","memo":"","name":"크로바타운","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 250-1","completion":"2021.01.22","entrance":"","facilities":"","firedoor":"","id":"1776672288978956on","memo":"","name":"크리스아크","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 796-5","completion":"2017.05.02","entrance":"","facilities":"","firedoor":"","id":"1776672288978z4y4q","memo":"","name":"테크노타워","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 799-17","completion":"2019.09.27","entrance":"","facilities":"","firedoor":"","id":"1776672288978r2so3","memo":"","name":"테크노타워2차","officeLoc":"","officeNum":"02-6959-9384","parking":"","room":""},{"address":"화곡동 1097-9","completion":"2021.09.16","entrance":"","facilities":"","firedoor":"","id":"1776672288978g274j","memo":"","name":"투웨니퍼스트 강서마곡","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 799-11","completion":"2019.12.19","entrance":"","facilities":"","firedoor":"","id":"1776672288978wbai0","memo":"","name":"파인스퀘어","officeLoc":"","officeNum":"A동 02-2667-0154\nB동 02-2667-0154","parking":"","room":""},{"address":"화곡동 987-1","completion":"2020.03.20","entrance":"","facilities":"","firedoor":"","id":"1776672288978l1ood","memo":"","name":"파크뷰에버","officeLoc":"","officeNum":"02-2699-9721","parking":"","room":""},{"address":"등촌동 682","completion":"2000.11.29","entrance":"","facilities":"","firedoor":"","id":"17766722889789cjs0","memo":"","name":"평안빌딩","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 799-2","completion":"2019.04.01","entrance":"","facilities":"","firedoor":"","id":"1776672288978xcdeo","memo":"","name":"푸리마타워","officeLoc":"","officeNum":"02-2662-7757","parking":"","room":""},{"address":"가양동 187-7","completion":"2020.07.16","entrance":"공동현관문 종3690","facilities":"","firedoor":"","id":"17766722889785447f","memo":"","name":"플래티노","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 793-9","completion":"2015.06.22","entrance":"","facilities":"","firedoor":"","id":"1776672288978hrmn7","memo":"","name":"플레이스","officeLoc":"","officeNum":"02-2659-6982","parking":"","room":""},{"address":"마곡동 795-1","completion":"2016.07.18","entrance":"#9999#","facilities":"","firedoor":"","id":"1776672288978kogac","memo":"","name":"필네이처","officeLoc":"","officeNum":"02-2658-2748","parking":"","room":""},{"address":"강서구 염창동 261-4","completion":"2022.05.18.","entrance":"","facilities":"","firedoor":"","id":"1776672288978b8h6s","memo":"","name":"한강G트리타워","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"마곡동 798-17","completion":"2020.06.29","entrance":"","facilities":"","firedoor":"","id":"17766722889788c4js","memo":"","name":"한일노벨리아타워","officeLoc":"","officeNum":"02-2666-7800","parking":"","room":""},{"address":"공항동 1371","completion":"2000.09.25.","entrance":"","facilities":"","firedoor":"","id":"1776672288978vlw5z","memo":"","name":"해태아파트","officeLoc":"","officeNum":"02-2661-2430","parking":"","room":""},{"address":"마곡동 739-4","completion":"2015.07.29","entrance":"10#9999#*","facilities":"","firedoor":"","id":"17766722889786nbty","memo":"","name":"헤리움1차","officeLoc":"","officeNum":"02-2661-6011","parking":"","room":""},{"address":"마곡동 758-3","completion":"2016.04.26","entrance":"0407#0603#","facilities":"","firedoor":"","id":"1776672288978ugshq","memo":"","name":"헤리움2차","officeLoc":"","officeNum":"02-2063-4001","parking":"","room":""},{"address":"공항동 8-5","completion":"2025. 3. 11","entrance":"","facilities":"","firedoor":"","id":"1776672288978kfzh6","memo":"","name":"헬리그라프","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"공항동 8-5","completion":"2024. 2. 8","entrance":"","facilities":"","firedoor":"","id":"177667228897845mxu","memo":"","name":"헬리그라프마곡에디션","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"등촌동 640-2","completion":"2021.05.20","entrance":"","facilities":"","firedoor":"","id":"1776672288978tscsu","memo":"","name":"현대센트럴가양","officeLoc":"","officeNum":"","parking":"","room":""},{"address":"가양동 57-11","completion":"2020.06.02","entrance":"#*1205# 혹은 별제외","facilities":"","firedoor":"","id":"1776672288978rgp4e","memo":"","name":"호성스카이","officeLoc":"","officeNum":"관리소장님 010-5306-8570","parking":"","room":""},{"address":"마곡동 760-1","completion":"2017.01.04","entrance":"","facilities":"","firedoor":"","id":"1776672288978q3w8t","memo":"","name":"힐스나루","officeLoc":"","officeNum":"02-2058-2446","parking":"","room":""},{"address":"마곡동 773-3","completion":"2017.03.17","entrance":"1322#9087#","facilities":"","firedoor":"","id":"177667228897814f3w","memo":"","name":"힐스동익","officeLoc":"","officeNum":"02-3665-8542","parking":"","room":""},{"address":"마곡동 773","completion":"2017.12.13","entrance":"##3340","facilities":"","firedoor":"","id":"17766722889786o56u","memo":"","name":"힐스마곡역","officeLoc":"","officeNum":"02-3664-2110","parking":"","room":""},{"address":"마곡동 797-14","completion":"2016.04.14","entrance":"","facilities":"","firedoor":"","id":"1776672288978anr5n","memo":"","name":"힐스발산","officeLoc":"","officeNum":"02-2666-7702","parking":"","room":""}];
  storage.get(['addresses'], (result) => {
      if (result.addresses && result.addresses.length > 0) {
          addressData = result.addresses;
          renderAddresses();
      } else {
          addressData = [...INITIAL_ADDRESSES];
          storage.set({ addresses: addressData });
          renderAddresses();
      }
  });

  // Address Search Event
  const addressSearchInput = document.getElementById('addressSearch');
  const clearAddressSearch = document.getElementById('clearAddressSearch');
  if (addressSearchInput) {
      addressSearchInput.addEventListener('input', (e) => {
          addressSearchQuery = e.target.value;
          if (e.target.value.length > 0) clearAddressSearch.classList.add('visible');
          else clearAddressSearch.classList.remove('visible');
          renderAddresses();
      });
      if (clearAddressSearch) {
        clearAddressSearch.addEventListener('click', () => {
          addressSearchInput.value = '';
          addressSearchInput.dispatchEvent(new Event('input'));
          addressSearchInput.focus();
        });
      }

      addressSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const firstItem = document.getElementById('addressList').querySelector('.address-item');
          if (firstItem) {
            firstItem.focus();
            e.preventDefault();
          }
        }
      });
  }

  // Address Modal Button Events
  const btnAddressAdd = document.getElementById('btnAddressAdd');
  if (btnAddressAdd) btnAddressAdd.addEventListener('click', () => openAddressEditModal(true));

  const btnAddrViewClose = document.getElementById('btnAddrViewClose');
  if (btnAddrViewClose) btnAddrViewClose.addEventListener('click', closeAddressViewModal);

  const btnAddrViewEdit = document.getElementById('btnAddrViewEdit');
  if (btnAddrViewEdit) btnAddrViewEdit.addEventListener('click', () => openAddressEditModal(false));

  const btnCancelAddrEdit = document.getElementById('btnCancelAddrEdit');
  if (btnCancelAddrEdit) btnCancelAddrEdit.addEventListener('click', () => {
      closeAddressEditModal();
      if (currentEditType === 'edit') openAddressViewModal(selectedAddressId);
  });

  const btnSaveAddr = document.getElementById('btnSaveAddr');
  if (btnSaveAddr) btnSaveAddr.addEventListener('click', saveAddress);

  const btnAddrViewDelete = document.getElementById('btnAddrViewDelete');
  if (btnAddrViewDelete) {
      btnAddrViewDelete.addEventListener('click', () => {
          deleteMode = 'address';
          deleteModal.classList.remove('hidden');
      });
  }

  // ----------------------------------------------------
  // 6. Backup & Restore Logic
  // ----------------------------------------------------
  const btnBackup = document.getElementById('btnBackup');
  const btnRestore = document.getElementById('btnRestore');
  const importFile = document.getElementById('importFile');

  if (btnBackup) {
    btnBackup.addEventListener('click', () => {
      // Get all core data including PDF meta
      storage.get(['memo', 'bookmarks', 'clipboards', 'addresses', 'pdfMeta'], (result) => {
        const data = {
          memo: result.memo || '',
          bookmarks: result.bookmarks || [],
          clipboards: result.clipboards || [],
          addresses: result.addresses || [],
          pdfMeta: result.pdfMeta || [],
          version: '1.0',
          backupDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        a.href = url;
        a.download = `sidebar_backup_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  }

  if (btnRestore) {
    btnRestore.addEventListener('click', () => {
      importFile.click();
    });
  }

  if (importFile) {
    importFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          
          if (!data || (typeof data !== 'object')) {
            alert('유효하지 않은 백업 데이터 형식입니다.');
            importFile.value = '';
            return;
          }

          if (!confirm('백업 파일을 복구하시겠습니까? 기존 데이터는 모두 덮어씌워집니다.')) {
            importFile.value = '';
            return;
          }

          // Summary message to help debugging
          const summary = `가져온 데이터:
- 메모: ${data.memo ? '있음' : '없음'}
- 북마크: ${Array.isArray(data.bookmarks) ? data.bookmarks.length : 0}개
- 클립보드: ${Array.isArray(data.clipboards) ? data.clipboards.length : 0}개
- 주소록: ${Array.isArray(data.addresses) ? data.addresses.length : 0}개
- PDF: ${Array.isArray(data.pdfMeta) ? data.pdfMeta.length : 0}개

복구를 시작합니다...`;
          
          alert(summary);

          storage.set({
            memo: data.memo || '',
            bookmarks: data.bookmarks || [],
            clipboards: data.clipboards || [],
            addresses: data.addresses || [],
            pdfMeta: data.pdfMeta || []
          }, () => {
            alert('데이터 복구 성공! 페이지를 새로고침하여 최종 적용합니다.');
            setTimeout(() => {
              location.reload();
            }, 300);
          });
        } catch (err) {
          alert('복구 중 오류가 발생했습니다: ' + err.message);
          console.error(err);
          importFile.value = '';
        }
      };
      reader.onerror = () => {
        alert('파일을 읽는 중 오류가 발생했습니다.');
        importFile.value = '';
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  // ===================== PDF VIEWER LOGIC =====================
  const pdfFileInput = document.getElementById('pdfFileInput');
  const pdfFileList = document.getElementById('pdfFileList');
  const pdfListView = document.getElementById('pdfListView');
  const pdfDetailView = document.getElementById('pdfDetailView');
  const pdfFrame = document.getElementById('pdfFrame');
  const pdfViewerTitle = document.getElementById('pdfViewerTitle');
  const btnPdfUpload = document.getElementById('btnPdfUpload');
  const btnPdfBack = document.getElementById('btnPdfBack');
  const btnPdfDownload = document.getElementById('btnPdfDownload');
  const pdfSearchInput = document.getElementById('pdfSearch');
  const clearPdfSearch = document.getElementById('clearPdfSearch');

  let pdfMeta = []; // [{id, name, size, date}]
  let pdfSearchQuery = '';
  let currentPdfId = null;

  // Load PDF metadata
  function loadPdfMeta() {
    storage.get('pdfMeta', (data) => {
      pdfMeta = data.pdfMeta || [];
      renderPdfList();
    });
  }

  function savePdfMeta() {
    storage.set({ pdfMeta }, () => {
      if (chrome.runtime.lastError) {
        console.error('Meta save error:', chrome.runtime.lastError);
      }
    });
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderPdfList() {
    if (!pdfFileList) return;
    const query = pdfSearchQuery.toLowerCase();
    const filtered = pdfMeta.filter(p => p.name.toLowerCase().includes(query));

    if (filtered.length === 0) {
      pdfFileList.innerHTML = `
        <div class="pdf-empty-state">
          <div class="placeholder-icon">📄</div>
          <p>${pdfSearchQuery ? '검색 결과가 없습니다' : 'PDF 파일을 추가해 보세요'}</p>
        </div>`;
      return;
    }

    pdfFileList.innerHTML = filtered.map(pdf => `
      <div class="pdf-file-item" data-id="${pdf.id}">
        <div class="pdf-file-icon">📄</div>
        <div class="pdf-file-info">
          <div class="pdf-file-name">${pdf.name}</div>
          <div class="pdf-file-meta">${formatFileSize(pdf.size)} · ${pdf.date}</div>
        </div>
        <button class="pdf-file-delete" data-id="${pdf.id}" title="삭제">✕</button>
      </div>
    `).join('');

    // Click to view
    pdfFileList.querySelectorAll('.pdf-file-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.pdf-file-delete')) return;
        openPdfViewer(item.dataset.id);
      });
    });

    // Delete button
    pdfFileList.querySelectorAll('.pdf-file-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const pdf = pdfMeta.find(p => p.id === id);
        if (pdf && confirm(`"${pdf.name}" 파일을 삭제하시겠습니까?`)) {
          deletePdf(id);
        }
      });
    });
  }

  let currentObjectUrl = null;

  function openPdfViewer(id) {
    currentPdfId = id;
    const pdf = pdfMeta.find(p => p.id === id);
    if (!pdf) return;

    pdfViewerTitle.textContent = pdf.name;
    pdfListView.style.display = 'none';
    pdfDetailView.style.display = 'flex';
    if (pdfActionsEl) pdfActionsEl.style.display = 'none';

    // Load PDF data from storage
    storage.get('pdf_' + id, (data) => {
      const dataUri = data['pdf_' + id];
      if (dataUri) {
        try {
          // dataUri: "data:application/pdf;base64,JVBER..."
          const split = dataUri.split(',');
          const base64 = split[1];
          const byteCharacters = atob(base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/pdf' });

          // Revoke previous URL if exists
          if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
          
          currentObjectUrl = URL.createObjectURL(blob);
          pdfFrame.src = currentObjectUrl;
        } catch (err) {
          console.error('PDF Conversion Error:', err);
          alert('PDF 파일을 화면에 표시하는 중 오류가 발생했습니다.');
        }
      }
    });
  }

  function closePdfViewer() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    pdfFrame.src = '';
    currentPdfId = null;
    pdfDetailView.style.display = 'none';
    pdfListView.style.display = 'flex';
    if (pdfActionsEl) pdfActionsEl.style.display = 'flex';
  }

  function deletePdf(id) {
    pdfMeta = pdfMeta.filter(p => p.id !== id);
    savePdfMeta();
    storage.remove('pdf_' + id);
    renderPdfList();
  }

  // Upload handler
  if (btnPdfUpload) {
    btnPdfUpload.addEventListener('click', () => pdfFileInput.click());
  }

  if (pdfFileInput) {
    pdfFileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
      if (pdfFiles.length === 0) {
        alert('PDF 파일(.pdf)만 선택 가능합니다.');
        pdfFileInput.value = '';
        return;
      }

      let processed = 0;
      let hasError = false;

      pdfFiles.forEach(file => {
        const reader = new FileReader();
        reader.onerror = () => {
          hasError = true;
          processed++;
          console.error('File read error:', file.name);
        };
        reader.onload = (ev) => {
          const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
          const now = new Date();
          const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;

          const saveObj = {};
          saveObj['pdf_' + id] = ev.target.result;

          storage.set(saveObj, () => {
            if (chrome.runtime.lastError) {
              hasError = true;
              console.error('Storage error:', chrome.runtime.lastError);
              if (chrome.runtime.lastError.message.includes('QUOTA_BYTES')) {
                alert('저장 용량이 부족합니다. [확장 프로그램 관리] 페이지에서 이 확장 프로그램을 새로고침하여 [unlimitedStorage] 권한을 적용해 주세요.');
              }
            } else {
              pdfMeta.push({ id, name: file.name, size: file.size, date: dateStr });
              savePdfMeta();
            }

            processed++;
            if (processed === pdfFiles.length) {
              renderPdfList();
              pdfFileInput.value = '';
              if (hasError) {
                alert('일부 파일을 처리하는 중 오류가 발생했습니다.');
              }
            }
          });
        };
        reader.readAsDataURL(file);
      });
    });
  }

  // Back button
  if (btnPdfBack) {
    btnPdfBack.addEventListener('click', closePdfViewer);
  }

  // Download button
  if (btnPdfDownload) {
    btnPdfDownload.addEventListener('click', () => {
      if (!currentPdfId) return;
      const pdf = pdfMeta.find(p => p.id === currentPdfId);
      if (!pdf) return;

      storage.get('pdf_' + currentPdfId, (data) => {
        const base64 = data['pdf_' + currentPdfId];
        if (base64) {
          const a = document.createElement('a');
          a.href = base64;
          a.download = pdf.name;
          a.click();
        }
      });
    });
  }

  // Search
  if (pdfSearchInput) {
    pdfSearchInput.addEventListener('input', () => {
      pdfSearchQuery = pdfSearchInput.value.trim();
      renderPdfList();
    });
  }

  if (clearPdfSearch) {
    clearPdfSearch.addEventListener('click', () => {
      pdfSearchInput.value = '';
      pdfSearchQuery = '';
      renderPdfList();
    });
  }

  // Init PDF on load
  loadPdfMeta();

  // Initialize initial footer state
  updateFooterVisibility('memo');

});
