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
  const memoContent = document.getElementById('memoContent');
  const memoPreview = document.getElementById('memoPreview');
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

  // Handle Tab key for indentation in the textarea
  memoContent.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = memoContent.selectionStart;
      const end = memoContent.selectionEnd;
      const value = memoContent.value;
      
      // Insert 2 spaces at cursor position
      memoContent.value = value.substring(0, start) + "  " + value.substring(end);
      
      // Put caret at right position again
      memoContent.selectionStart = memoContent.selectionEnd = start + 2;
    }
  });



  function renderMarkdown() {
    const rawValue = memoContent.value || '';
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
      const renderer = new marked.Renderer();
      let headingIndex = 0;
      const counters = [0, 0, 0];
      
      // Override heading renderer to add IDs and numbering
      renderer.heading = ({ text, depth }) => {
        const d = Math.min(depth, 3);
        const id = `toc-heading-${headingIndex++}`;
        
        counters[d - 1]++;
        for (let i = d; i < 3; i++) counters[i] = 0;
        const number = counters.slice(0, d).join('.');

        return `<h${depth} id="${id}">${number}. ${text}</h${depth}>`;
      };

      marked.setOptions({
        renderer: renderer,
        gfm: true,
        breaks: true,
        headerIds: false,
        mangle: false
      });
      const cleanHtml = DOMPurify.sanitize(marked.parse(rawValue));
      memoPreview.innerHTML = cleanHtml;
      initCollapsibleHeaders();
    } else {
      memoPreview.textContent = rawValue;
    }
  }

  function initCollapsibleHeaders() {
    const headers = memoPreview.querySelectorAll('h1, h2, h3');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const level = parseInt(header.tagName.substring(1));
        header.classList.toggle('collapsed-header');
        const isCollapsed = header.classList.contains('collapsed-header');
        
        let next = header.nextElementSibling;
        while (next) {
          // Stop if we hit a header of same or higher level (smaller or equal depth number)
          if (next.tagName.match(/^H[1-3]$/)) {
            const nextLevel = parseInt(next.tagName.substring(1));
            if (nextLevel <= level) break;
          }
          
          if (isCollapsed) {
            next.classList.add('hidden-content');
          } else {
            // Only show if it's not hidden by its own parent collapse logic
            // (Note: This is a simple implementation, it will show everything under it)
            next.classList.remove('hidden-content');
            
            // If the next item is itself a collapsed header, skip its children
            if (next.classList.contains('collapsed-header')) {
              const subLevel = parseInt(next.tagName.substring(1));
              let subNext = next.nextElementSibling;
              while (subNext) {
                if (subNext.tagName.match(/^H[1-3]$/)) {
                  if (parseInt(subNext.tagName.substring(1)) <= subLevel) break;
                }
                subNext = subNext.nextElementSibling;
              }
              next = subNext;
              continue;
            }
          }
          next = next.nextElementSibling;
        }
      });
    });
  }

  function setMode(editing) {
    isEditMode = editing;
    memoContent.classList.toggle('editing', editing);
    if (isEditMode) {
      memoContent.classList.remove('hidden');
      memoPreview.classList.add('hidden');
      memoContent.focus();
      btnEdit.classList.add('hidden');
      btnClear.classList.remove('hidden');
      btnSave.classList.remove('hidden');
    } else {
      renderMarkdown();
      memoContent.classList.add('hidden');
      memoPreview.classList.remove('hidden');
      btnEdit.classList.remove('hidden');
      btnClear.classList.add('hidden');
      btnSave.classList.add('hidden');
    }
  }

  // Load saved memo and default to View Mode
  storage.get(['memo'], (result) => {
    if (result.memo) {
      memoContent.value = result.memo;
    }
    setMode(false); // Default to View mode initially
  });

  // Edit via Double Click
  memoContent.addEventListener('dblclick', () => {
    if (!isEditMode) {
      setMode(true);
    }
  });

  // Edit button click
  btnEdit.addEventListener('click', () => {
    setMode(true);
  });

  // Clear button click
  btnClear.addEventListener('click', () => {
    memoContent.value = '';
    memoContent.focus();
  });

  // Save button click
  btnSave.addEventListener('click', () => {
    const content = memoContent.value;
    storage.set({ memo: content }, () => {
      setMode(false); // Switch back to View Mode after saving
    });
  });

  function generateTOC() {
    const content = memoContent.value || '';
    const lines = content.split('\n');
    const headers = [];
    let headingIndex = 0;
    const counters = [0, 0, 0];

    lines.forEach(line => {
      // Look for ATX headers (# Title)
      const match = line.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const depth = Math.min(match[1].length, 3);
        counters[depth - 1]++;
        for (let i = depth; i < 3; i++) counters[i] = 0;
        const number = counters.slice(0, depth).join('.');

        headers.push({
          level: depth,
          text: `${number}. ${match[2].trim()}`,
          id: `toc-heading-${headingIndex++}`
        });
      }
    });

    if (headers.length === 0) {
      tocList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">표시할 목차가 없습니다.<br>(# 제목 형식을 사용하세요)</div>';
      return;
    }

    tocList.innerHTML = headers.map(h => `
      <div class="toc-item toc-h${h.level}" data-target="${h.id}">
        ${h.text}
      </div>
    `).join('');

    // TOC Item Click -> Navigate
    tocList.querySelectorAll('.toc-item').forEach(item => {
      item.addEventListener('click', () => {
        const targetId = item.getAttribute('data-target');
        tocModal.classList.add('hidden');
        
        // Navigation logic
        if (isEditMode) {
          setMode(false);
          setTimeout(() => scrollToTarget(targetId), 200);
        } else {
          scrollToTarget(targetId);
        }
      });
    });
  }

  function scrollToTarget(targetId) {
    const targetEl = memoPreview.querySelector(`#${targetId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.add('scroll-highlight');
      setTimeout(() => targetEl.classList.remove('scroll-highlight'), 3000);
    }
  }

  // TOC button events
  btnTOC.addEventListener('click', () => {
    generateTOC();
    tocModal.classList.remove('hidden');
  });

  btnTOCClose.addEventListener('click', () => {
    tocModal.classList.add('hidden');
  });
  
  // Download memo as MD file
  btnDownload.addEventListener('click', () => {
    const content = memoContent.value || '';
    if (!content.trim()) {
      alert('저장할 내용이 없습니다.');
      return;
    }
    
    // Use chrome.downloads API to force "Save As" dialog
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Find the first header in the content
    const headerMatch = content.match(/^#{1,6}\s+(.*)$/m);
    let fileName = '';
    
    if (headerMatch && headerMatch[1]) {
      // Use the first header text and sanitize it (remove invalid filename characters)
      fileName = headerMatch[1].trim().replace(/[\\/:*?"<>|]/g, '_');
    }
    
    if (!fileName) {
      // Fallback if no header is found
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
    a.download = `${fileName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Collapse all headers
  btnCollapseAll.addEventListener('click', () => {
    const headers = memoPreview.querySelectorAll('h1, h2, h3');
    if (headers.length === 0) return;

    // 1. Mark all headers as collapsed
    headers.forEach(h => h.classList.add('collapsed-header'));
    
    // 2. Hide all non-header elements
    // 3. Hide all headers that are children of another collapsed header
    const elements = Array.from(memoPreview.children);
    elements.forEach(el => {
      const isHeader = el.tagName.match(/^H[1-3]$/);
      if (!isHeader) {
        el.classList.add('hidden-content');
      } else {
        // It's a header. Should it be visible?
        // Only if it's not preceded by a higher-level collapsed header
        const level = parseInt(el.tagName.substring(1));
        let prev = el.previousElementSibling;
        let shouldHide = false;
        
        while (prev) {
          if (prev.tagName.match(/^H[1-3]$/)) {
            const prevLevel = parseInt(prev.tagName.substring(1));
            if (prevLevel < level && prev.classList.contains('collapsed-header')) {
              shouldHide = true;
              break;
            }
            if (prevLevel <= level) break; // Independent header
          }
          prev = prev.previousElementSibling;
        }
        
        if (shouldHide) {
          el.classList.add('hidden-content');
        } else {
          el.classList.remove('hidden-content');
        }
      }
    });
  });

  // Keyboard Shortcuts (Ctrl+E to toggle Edit/Save)
  window.addEventListener('keydown', (e) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    
    // Toggle Edit/Save: Ctrl + E
    if (isCtrl && e.key === 'e') {
      // Check if we are in memo tab
      if (memoActions.style.display !== 'none') {
        e.preventDefault();
        if (!btnEdit.classList.contains('hidden')) {
          // In View Mode -> Enter Edit Mode
          btnEdit.click();
        } else if (!btnSave.classList.contains('hidden')) {
          // In Edit Mode -> Save & Exit
          btnSave.click();
        }
      }
    }
  });
  
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
    
    // Toggle TOC, Download, and CollapseAll buttons based on memo tab
    if (btnTOC) btnTOC.style.display = (tabId === 'memo') ? 'block' : 'none';
    if (btnDownload) btnDownload.style.display = (tabId === 'memo') ? 'block' : 'none';
    if (btnCollapseAll) btnCollapseAll.style.display = (tabId === 'memo') ? 'block' : 'none';

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
  let bookmarks = new Array(GRID_SIZE).fill(null);
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
  let clipboards = new Array(GRID_SIZE).fill(null);
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
  storage.get(['addresses'], (result) => {
      if (result.addresses && result.addresses.length > 0) {
          addressData = result.addresses;
          renderAddresses();
      } else {
          loadAddressesFromCSV();
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
