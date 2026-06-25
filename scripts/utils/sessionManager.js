export const sessionManager = {
    init: () => {
        const urlParams = new URLSearchParams(window.location.search);
        let sid = urlParams.get('sid');
        
        if (!sid) {
            // If no sid in URL, check sessionStorage
            sid = sessionStorage.getItem('webm_sid');
            
            if (!sid) {
                // Generate a new simple sid
                sid = 'session_' + Math.random().toString(36).substring(2, 9);
            }
            
            // Redirect to URL with sid to maintain state
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('sid', sid);
            window.history.replaceState({}, '', newUrl);
        }
        
        sessionStorage.setItem('webm_sid', sid);
        console.log(`[SessionManager] Initialized with sid: ${sid}`);
        return sid;
    },
    
    getSid: () => {
        return sessionStorage.getItem('webm_sid');
    }
};
