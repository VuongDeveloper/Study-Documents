package patterns.creational.abstractFactory.ingredients.entity;

public class AngularDeveloper implements Developer{
    @Override
    public void getLanguage() {
        System.out.println("Angular");
    }
}
