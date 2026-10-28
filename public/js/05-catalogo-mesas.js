// Notas, categorías, platillos, mesas y meseros (carga y pantalla de caja).
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
async function loadModifiers() { try { const response = await fetch('/api/catalog/modifiers'); const data = await response.json(); currentModifiers = data.modifiers; const adminModifiersList = document.getElementById('admin-modifiers-list'); if (adminModifiersList) { adminModifiersList.innerHTML = ''; currentModifiers.forEach(m => { const displayPrice = m.price > 0 ? ` (+$${m.price})` : ''; adminModifiersList.innerHTML += `<span style="background: #2c2c2c; padding: 4px 8px; border-radius: 4px; border: 1px solid #444; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: bold;">${m.name}${displayPrice} <button onclick="deleteModifier(${m.id})" style="background: #c39bd3; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">✕</button></span>`; }); } } catch (error) { console.error('Error:', error); } }

let currentCategories = [];
async function loadCategories() {
    try {
        const response = await fetch('/api/catalog/categories');
        const data = await response.json();
        currentCategories = data.categories || [];
        renderAdminCategories();
        const tabsContainer = document.getElementById('category-tabs'); 
        if (tabsContainer) { 
            tabsContainer.innerHTML = `<button class="btn-category" onclick="filterCategory('TOP', this)" style="border-color: #e74c3c; color: #e74c3c;">⭐ </button>`;
            tabsContainer.innerHTML += `<button class="btn-category active" onclick="filterCategory('ALL', this)">Todo</button>`; 
            data.categories.forEach(cat => tabsContainer.innerHTML += `<button class="btn-category" onclick="filterCategory('${escapeHtml(cat.name)}', this)">${escapeHtml(cat.name)}</button>`); 
        } 
        const selectCategory = document.getElementById('new-category'); 
        if (selectCategory) { 
            selectCategory.innerHTML = `<option value="">Selecciona Categoría</option>`; 
            data.categories.forEach(cat => selectCategory.innerHTML += `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`); 
        } 
    } catch (error) { console.error('Error:', error); } 
}

function renderAdminCategories() {
    const list = document.getElementById('admin-categories-list');
    if (!list) return;
    const last = currentCategories.length - 1;
    list.innerHTML = currentCategories.map((c, i) => `
        <div class="admin-cat-row">
            <span class="admin-cat-name">${escapeHtml(c.name)}<span class="admin-cat-count">${c.product_count} platillo${c.product_count === 1 ? '' : 's'}</span></span>
            <button title="Subir" onclick="moveCategory(${i}, -1)" ${i === 0 ? 'disabled' : ''}>▲</button>
            <button title="Bajar" onclick="moveCategory(${i}, 1)" ${i === last ? 'disabled' : ''}>▼</button>
            <button title="Renombrar" onclick="renameCategory(${c.id})">✏️</button>
            <button title="Eliminar" class="cat-del" onclick="deleteCategory(${c.id})">✕</button>
        </div>`).join('') || '<p class="admin-hint">Aún no hay categorías.</p>';
}

window.moveCategory = async function(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= currentCategories.length) return;
    const ids = currentCategories.map(c => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
        const response = await fetch('/api/catalog/categories/order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
        if (!response.ok) await customAlert('No se pudo cambiar el orden', 'error');
        loadCategories();
    } catch (e) { await customAlert('Error de red al ordenar categorías', 'error'); }
};

window.renameCategory = async function(id) {
    const c = currentCategories.find(x => x.id === id);
    if (!c) return;
    const name = await customPrompt(`Nuevo nombre para ${c.name}. Sus ${c.product_count} platillo(s) se moverán solos.`, 'text', c.name, 'Renombrar categoría');
    if (!name || !name.trim() || name.trim() === c.name) return;
    try {
        const response = await fetch(`/api/catalog/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al renombrar', 'error');
        }
        loadCategories(); loadProducts(); loadAdminProducts();
    } catch (e) { await customAlert('Error de red al renombrar categoría', 'error'); }
};

window.deleteCategory = async function(id) {
    const c = currentCategories.find(x => x.id === id);
    if (!c) return;
    if (c.product_count > 0) {
        await customAlert(`${c.name} tiene ${c.product_count} platillo(s). Cámbialos de categoría con "Editar" o bórralos primero.`, 'warning');
        return;
    }
    if (!(await customConfirm(`¿Eliminar la categoría ${c.name}?`))) return;
    try {
        const response = await fetch(`/api/catalog/categories/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al eliminar', 'error');
        }
        loadCategories();
    } catch (e) { await customAlert('Error de red al eliminar categoría', 'error'); }
};

function displayProducts(productsToDisplay) { 
    menuGrid.innerHTML = ''; 
    productsToDisplay.forEach(product => { 
        const btn = document.createElement('button'); 
        btn.className = 'btn-product'; 
        
        if (product.station === 'COCINA') {
            btn.style.boxShadow = 'inset 0 4px 0 rgba(211, 84, 0, 0.8)'; /* Brillo superior Naranja */
        } else if (product.station === 'BARRA') {
            btn.style.boxShadow = 'inset 0 4px 0 rgba(52, 152, 219, 0.8)'; /* Brillo superior Azul */
        }

        const isAvailable = product.is_available !== 0; 
        if (!isAvailable) {
            btn.style.background = 'rgba(20, 20, 20, 0.8)'; 
            btn.style.color = '#7f8c8d'; 
            btn.style.cursor = 'not-allowed';
            btn.style.boxShadow = 'inset 0 4px 0 rgba(34, 34, 34, 0.8)'; /* Borde gris apagado */
            btn.innerHTML = `<span style="text-decoration: line-through;">${escapeHtml(product.name)}</span><br><span style="color: #e74c3c; font-weight: bold; font-size: 11px;">🚫 AGOTADO</span>`;
            btn.onclick = () => customAlert('Este platillo está marcado como AGOTADO.', 'warning');
        } else {
            btn.textContent = `${escapeHtml(product.name)} - $${product.price}`; 
            btn.onclick = () => addToOrder(product); 
        }
        menuGrid.appendChild(btn); 
    }); 
}

function filterCategory(category, btnElement) { 
    document.querySelectorAll('#category-tabs button').forEach(tab => tab.classList.remove('active')); 
    if(btnElement) btnElement.classList.add('active'); 
    
    const searchInput = document.getElementById('search-product');
    if (searchInput) searchInput.value = '';

    if (category === 'ALL') {
        displayProducts(allProducts); 
    } else if (category === 'TOP') {
        const sortedTop = [...allProducts].sort((a, b) => (productClicks[b.id] || 0) - (productClicks[a.id] || 0)).slice(0, 8);
        displayProducts(sortedTop);
    } else { 
        displayProducts(allProducts.filter(p => p.category === category)); 
    } 
}

// ========================================================
// SISTEMA DE PESTAÑAS PARA MESAS (Comedor vs Mostrador)
// ========================================================
let currentTableTab = 'COMEDOR';

window.switchTableTab = function(tabName) {
    currentTableTab = tabName;
    loadTables();
};

async function loadTables() {
    try {
        const response = await fetch('/api/catalog/tables'); 
        const data = await response.json(); 
        
        tablesGrid.innerHTML = `
            <div class="table-tabs-container">
                <button onclick="switchTableTab('COMEDOR')" class="table-tab-btn ${currentTableTab === 'COMEDOR' ? 'active' : ''}">🍽️ COMEDOR</button>
                <button onclick="switchTableTab('LLEVAR')" class="table-tab-btn ${currentTableTab === 'LLEVAR' ? 'active-llevar' : ''}">🛍️ LLEVAR</button>
            </div>
            
            <div id="grid-comedor" class="tables-list" ${currentTableTab === 'COMEDOR' ? '' : 'hidden'}></div>
            <div id="grid-llevar" class="tables-list" ${currentTableTab === 'LLEVAR' ? '' : 'hidden'}></div>
        `;
        
        const gridComedor = document.getElementById('grid-comedor');
        const gridLlevar = document.getElementById('grid-llevar');

        let tablesList = data.tables || [];
        if (filterOnlyMyTables) {
            const currentMyWaiter = (getDeviceWaiter() || '').toLowerCase().trim();
            if (currentMyWaiter) {
                tablesList = tablesList.filter(t => {
                    if (t.status === 'LIBRE') return true;
                    return t.waiter_name && t.waiter_name.toLowerCase().trim() === currentMyWaiter;
                });
            }
        }

        tablesList.forEach(table => {
            const esLlevar = table.table_number.toUpperCase().includes('LLEVAR');
            const btn = document.createElement('button'); 
            btn.className = `btn-table ${table.status === 'OCUPADA' ? 'ocupada' : ''}`;
            
            // El botón ocupa todo su lugar (columna angosta en la PC, cuadro de la cuadrícula en celular)
            btn.style.width = '100%';
            btn.style.minHeight = '75px';
            btn.style.margin = '0';
            btn.style.padding = '8px';
            btn.style.display = 'flex';
            btn.style.flexDirection = 'column';
            btn.style.justifyContent = 'center';
            btn.style.alignItems = 'center';

            if (esLlevar) {
                btn.style.border = '2px dashed #9b59b6';
                if (table.status === 'OCUPADA') btn.style.background = 'linear-gradient(145deg, #2c3e50, #8e44ad)';
            }

            let displayTotal = table.current_total || 0; 
            if (table.remaining_balance !== null && table.remaining_balance !== undefined) { displayTotal = table.remaining_balance; }
            
            // CREACIÓN DE TIPOGRAFÍA DE ALTO CONTRASTE
            const textoMesa = `<span style="font-weight:300; font-size: 11px; letter-spacing: 2px; color: #7f8c8d;">MESA</span><br><span style="font-weight:900; font-size: 24px; line-height: 1.1; color: #fff;">${escapeHtml(table.table_number)}</span>`;

            const draftBadge = table.has_draft
                ? `<div style="background: #f39c12; color: #1a1a1a; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-top: 4px; max-width: 95%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">📝 SIN ENVIAR${table.status !== 'OCUPADA' && table.draft_waiter ? ' · ' + escapeHtml(table.draft_waiter) : ''}</div>`
                : '';

            if (table.status === 'OCUPADA') {
                const mins = table.minutes_open || 0; 
                let timeClass = 'time-green';
                let timeIcon = '🟢';
                if (mins > 45) {
                    timeClass = 'time-red';
                    timeIcon = '🔴';
                } else if (mins > 20) {
                    timeClass = 'time-orange';
                    timeIcon = '🟡';
                }
                
                // Etiqueta dinámica de Folio (solo aparece si el backend lo manda)
                const etiquetaFolio = table.active_folio 
                    ? `<div style="background: #e74c3c; color: #fff; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; margin: 4px 0 0 0;">Folio: ${escapeHtml(table.active_folio_label || '#' + table.active_folio)}</div>` 
                    : '';

                const badgeSemaforo = `<div class="badge-time ${timeClass}"><span>${timeIcon}</span> <span>${mins}m</span></div>`;

                const waiterBadge = table.waiter_name 
                    ? `<div style="font-size: 10px; color: #3498db; font-weight: bold; margin-top: 3px; max-width: 95%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">👤 ${escapeHtml(table.waiter_name)}</div>` 
                    : '';

                if (displayTotal > 0) { 
                    btn.innerHTML = `${textoMesa}${etiquetaFolio}${badgeSemaforo}${waiterBadge}${draftBadge}<span style="font-size: 14px; color: #f1c40f; font-weight: 900; margin-top: 2px;">$${displayTotal.toFixed(2)}</span>`; 
                } else { 
                    btn.innerHTML = `${textoMesa}${etiquetaFolio}${badgeSemaforo}${waiterBadge}${draftBadge}`; 
                }
            } else { 
                btn.innerHTML = `${textoMesa}${draftBadge}`; 
            }
            btn.dataset.id = table.id;
            btn.onclick = () => {
                selectTable(table);
                // En celular/tablet las mesas van arriba del menú: al elegir una, se baja solo al menú para empezar a pedir
                if (window.matchMedia('(max-width: 950px)').matches) {
                    const menu = document.querySelector('.menu-section');
                    if (menu) setTimeout(() => menu.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
                }
            };
            if (esLlevar) { gridLlevar.appendChild(btn); } else { gridComedor.appendChild(btn); }
        });

        const adminTablesList = document.getElementById('admin-tables-list'); 
        if (adminTablesList) { 
            adminTablesList.innerHTML = ''; 
            data.tables.forEach(table => adminTablesList.innerHTML += `<span style="background: #2c2c2c; padding: 6px 12px; border-radius: 4px; border: 1px solid #444; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: bold;">🪑 ${escapeHtml(table.table_number)} <button onclick="deleteTable(${table.id})" style="background: #e74c3c; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">✕</button></span>`); 
        }
    } catch (error) { console.error('Error:', error); }
}

window.deleteTable = async function(id) { 
    if (!(await customConfirm('¿Estás seguro de eliminar esta mesa?', 'Eliminar Mesa'))) return; 
    try {
        const response = await fetch(`/api/catalog/tables/${id}`, { method: 'DELETE' }); 
        if (response.ok) {
            loadTables(); 
        } else { 
            const err = await response.json().catch(() => ({})); 
            await customAlert(`Error: ${err.error || 'No se pudo eliminar la mesa'}`, 'error'); 
        } 
    } catch(e) {
        await customAlert('Error de red al eliminar mesa', 'error');
    }
};
async function loadWaiters() { 
    try { 
        const response = await fetch('/api/catalog/waiters'); 
        const data = await response.json(); 
        if (waiterSelect) { 
            waiterSelect.innerHTML = `<option value="">Seleccione mesero...</option>`; 
            data.waiters.forEach(w => waiterSelect.innerHTML += `<option value="${escapeHtml(w.name)}">${escapeHtml(w.name)}</option>`); 
            const savedDeviceWaiter = getDeviceWaiter() || lastSelectedWaiter;
            if (savedDeviceWaiter) { 
                waiterSelect.value = savedDeviceWaiter; 
                lastSelectedWaiter = savedDeviceWaiter;
            } 
        } 
        updateDeviceWaiterBadge();
        const adminWaitersList = document.getElementById('admin-waiters-list'); 
        if (adminWaitersList) { 
            adminWaitersList.innerHTML = ''; 
            data.waiters.forEach(w => adminWaitersList.innerHTML += `<span style="background: #2c2c2c; padding: 6px 12px; border-radius: 4px; border: 1px solid #444; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: bold;">👤 ${escapeHtml(w.name)} <button onclick="deleteWaiter(${w.id})" style="background: #e74c3c; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">✕</button></span>`); 
        } 
    } catch (error) { 
        console.error('Error:', error); 
    } 
}

async function loadProducts() { try { const response = await fetch('/api/catalog/products'); const data = await response.json(); allProducts = data.products; displayProducts(allProducts); } catch (error) { console.error('Error:', error); } }

