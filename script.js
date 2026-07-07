/**
 * Geenora - Client Side Interactions
 * This file contains lightweight JavaScript to enhance the user experience
 * by adding scroll effects and button interactivity.
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Sticky Header Scroll Effect
    // Adds a deeper shadow to the header when the user scrolls down
    const header = document.querySelector('header');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.1)';
            header.style.transition = 'box-shadow 0.3s ease';
        } else {
            header.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.05)';
        }
    });

    // 2. Interactive Buttons (Mocking functionality)
    // Select all action buttons and attach a simple alert for demo purposes
    const actionButtons = document.querySelectorAll('.icon-btn, .btn, .cta-btn, .explore-button, .main-cta-button');
    
    actionButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // Prevent default link behavior if it's an anchor tag with href="#"
            if(button.tagName === 'A' && button.getAttribute('href') === '#') {
                e.preventDefault();
            }
            
            // Get the text content of the button to make the alert context-aware
            const btnText = button.textContent.trim().replace(/[^\u0600-\u06FF\w\s]/g, '').trim(); 
            
            if (btnText) {
                console.log(`Action triggered: ${btnText}`);
                // In a real app, this would open a modal or navigate to a route.
            }
        });
    });

    // 3. Smooth revealing of feature cards on scroll (Simple Intersection Observer)
    const cards = document.querySelectorAll('.feature-card, .step-card, .payment-card');
    
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    cards.forEach(card => {
        // Set initial state for animation
        card.style.opacity = '0.8';
        // The actual transform is handled in CSS, but we ensure it's observed here
        observer.observe(card);
    });
});
