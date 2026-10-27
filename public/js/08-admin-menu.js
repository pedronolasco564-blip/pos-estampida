// Administración de menú: PIN, respaldo, platillos, categorías, mesas y meseros.
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
const pinForm = document.getElementById('pin-form');
if (pinForm) { pinForm.onsubmit = async (e) => { e.preventDefault(); const currentPin = document.getElementById('current-pin').value; const newPin = document.getElementById('new-pin').value; try { const response = await fetch('/api/catalog/settings/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }) }); const result = await response.json(); if (response.ok) { await customAlert('PIN actualizado con éxito.', 'success'); pinForm.reset(); } else { await customAlert(`Error: ${result.error}`, 'error'); } } catch (err) { await customAlert('Fallo de red.', 'error'); } }; }

const btnBackupDb = document.getElementById('btn-backup-dashboard');
if (btnBackupDb) {
    btnBackupDb.onclick = async () => {
        const pin = await customPrompt('Por su seguridad, reingrese el PIN de Administrador para descargar:', 'password'); 
        if (!pin) return;
        if (!navigator.onLine) { await customAlert('No hay red.', 'error'); return; }
        try { const response = await fetch('/api/reports/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) }); if (response.ok) { const blob = await response.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Respaldo_Estampida_${obtenerFechaLocal()}.db`; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); await customAlert('Respaldo descargado con éxito.', 'success'); } else { const errorText = await response.text(); let errorMessage = 'Error desconocido'; try { errorMessage = JSON.parse(errorText).error; } catch(e) { errorMessage = 'La ruta no fue encontrada.'; } await customAlert(`Error: ${errorMessage}`, 'error'); } } catch (e) { await customAlert(`Servidor desconectado.`, 'error'); }
    };
}

let adminProductsList = [];

async function loadAdminProducts() { 
    const tbody = document.getElementById('admin-products-tbody'); 
    if (!tbody) return; 
    try {
        const response = await fetch('/api/catalog/products'); 
        const data = await response.json(); 
        adminProductsList = data.products || [];
        tbody.innerHTML = ''; 
        adminProductsList.forEach(p => { 
            const isAvailable = p.is_available !== 0;
            const statusBtn = isAvailable 
                ? `<button onclick="toggleProductStatus(${p.id}, 0)" style="background:#27ae60; color:white; border:none; padding:6px 10px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;">🟢 Disponible</button>`
                : `<button onclick="toggleProductStatus(${p.id}, 1)" style="background:#c0392b; color:white; border:none; padding:6px 10px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;">🔴 Agotado</button>`;

            tbody.innerHTML += `<tr><td>${escapeHtml(p.name)}</td><td>$${p.price.toFixed(2)}</td><td>${escapeHtml(p.station)}</td><td>${escapeHtml(p.category)}</td><td style="text-align: center;">${statusBtn}</td><td><button onclick="editProduct(${p.id})" class="btn-secondary" style="background-color: #f39c12; color: #1a1a1a; font-weight: 800; padding: 4px 10px; border: none;">Editar</button> <button onclick="deleteProduct(${p.id})" class="btn-secondary" style="background-color: #e74c3c; padding: 4px; border: none; color: white;">X</button></td></tr>`; 
        }); 
    } catch(err) {
        console.error('Error al cargar productos de admin:', err);
    }
}

window.toggleProductStatus = async function(id, newStatus) { 
    try { 
        await fetch(`/api/catalog/products/${id}/toggle`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_available: newStatus }) }); 
        loadAdminProducts(); 
        loadProducts(); 
    } catch(e) { 
        console.error(e); 
    } 
};

const modifierForm = document.getElementById('modifier-form'); 
if (modifierForm) modifierForm.onsubmit = async (e) => { 
    e.preventDefault(); 
    const name = document.getElementById('new-modifier-name').value.trim();
    const priceVal = document.getElementById('new-modifier-price').value; 
    try {
        const response = await fetch('/api/catalog/modifiers', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name, price: priceVal ? parseFloat(priceVal) : 0 }) 
        }); 
        if (response.ok) {
            document.getElementById('new-modifier-name').value = ''; 
            document.getElementById('new-modifier-price').value = ''; 
            loadModifiers(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al guardar modificador', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al guardar modificador', 'error');
    }
};

window.deleteModifier = async function(id) { 
    if (!(await customConfirm('¿Eliminar modificador?'))) return; 
    try {
        const response = await fetch(`/api/catalog/modifiers/${id}`, { method: 'DELETE' }); 
        if (response.ok) {
            loadModifiers(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al eliminar', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al eliminar', 'error');
    }
};

const categoryForm = document.getElementById('category-form');
if (categoryForm) categoryForm.onsubmit = async (e) => { 
    e.preventDefault(); 
    const name = document.getElementById('new-category-name').value.trim();
    try {
        const response = await fetch('/api/catalog/categories', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name }) 
        }); 
        if (response.ok) {
            document.getElementById('new-category-name').value = ''; 
            loadCategories(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al crear categoría', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al crear categoría', 'error');
    }
};

const waiterForm = document.getElementById('waiter-form');
if (waiterForm) waiterForm.onsubmit = async (e) => { 
    e.preventDefault(); 
    const name = document.getElementById('new-waiter-name').value.trim();
    try {
        const response = await fetch('/api/catalog/waiters', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name }) 
        }); 
        if (response.ok) {
            document.getElementById('new-waiter-name').value = ''; 
            loadWaiters(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al crear mesero', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al crear mesero', 'error');
    }
};

window.deleteWaiter = async function(id) { 
    if (!(await customConfirm('¿Eliminar mesero?'))) return; 
    try {
        const response = await fetch(`/api/catalog/waiters/${id}`, { method: 'DELETE' }); 
        if (response.ok) {
            loadWaiters(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al eliminar mesero', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al eliminar mesero', 'error');
    }
};

const tableForm = document.getElementById('table-form');
if (tableForm) tableForm.onsubmit = async (e) => { 
    e.preventDefault(); 
    const table_number = document.getElementById('new-table-number').value.trim();
    try {
        const response = await fetch('/api/catalog/tables', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ table_number }) 
        }); 
        if (response.ok) {
            document.getElementById('new-table-number').value = ''; 
            loadTables(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al crear mesa', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al crear mesa', 'error');
    }
};

const productForm = document.getElementById('product-form');
if (productForm) productForm.onsubmit = async (e) => { 
    e.preventDefault(); 
    const name = document.getElementById('new-name').value.trim();
    const price = parseFloat(document.getElementById('new-price').value);
    const station = document.getElementById('new-station').value;
    const category = document.getElementById('new-category').value;
    try {
        const response = await fetch('/api/catalog/products', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name, price, station, category }) 
        }); 
        if (response.ok) {
            productForm.reset(); 
            loadAdminProducts(); 
            loadProducts(); loadCategories(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al crear producto', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al crear producto', 'error');
    }
};

window.deleteProduct = async function(id) { 
    if (!(await customConfirm('¿Estás seguro de eliminar este platillo?'))) return; 
    try {
        const response = await fetch(`/api/catalog/products/${id}`, { method: 'DELETE' }); 
        if (response.ok) {
            loadAdminProducts(); 
            loadProducts(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al eliminar', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al eliminar platillo', 'error');
    }
};

window.editProduct = async function(id) { 
    const p = adminProductsList.find(item => item.id === id);
    if (!p) return;
    const newName = await customPrompt("Nuevo nombre:", "text", p.name); 
    if (!newName) return; 
    await new Promise(resolve => setTimeout(resolve, 250)); 
    const newPrice = await customPrompt("Nuevo precio:", "number", p.price);
    if (!newPrice || isNaN(parseFloat(newPrice))) return;
    await new Promise(resolve => setTimeout(resolve, 250));
    const newCategory = await customSelect("Categoría:", currentCategories.map(c => c.name), p.category, 'Categoría del platillo');
    if (!newCategory) return; 
    try {
        const response = await fetch(`/api/catalog/products/${id}`, { 
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name: newName.trim(), price: parseFloat(newPrice), station: p.station, category: newCategory }) 
        }); 
        if (response.ok) {
            loadAdminProducts();
            loadProducts();
            loadCategories();
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al actualizar', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al actualizar platillo', 'error');
    }
};

